import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  request,
  getGlobalDispatcher,
  interceptors as undiciInterceptors,
  ProxyAgent,
  Agent as UndiciAgent,
  Dispatcher as UndiciDispatcher,
} from 'undici';
import { CookieAgent } from 'http-cookie-agent/undici';
import { CookieJar } from 'tough-cookie';

import { Observable, defer, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import {
  UNDICI_INSTANCE_TOKEN,
  HTTP_MODULE_OPTIONS,
} from '../constants/http.constants';

import type { UrlObject } from 'node:url';
import type { Dispatcher } from 'undici';
import type { HttpModuleOptions, UndiciRequestOptionsType } from '../types';
import type {
  HttpInterceptor,
  HttpInterceptorFunction,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
  AxiosCompatibleRequestConfig,
  AxiosCompatibleRequestOptions,
  AxiosLikeRequestConfig,
  HttpRequestOptions,
  AxiosLikeResponse,
  AxiosRef,
} from '../interfaces';
import { createAxiosRef } from '../adapters/axios-ref.factory';
import {
  createInterceptorStore,
  type AxiosInterceptorEntry,
  type AxiosInterceptorStore,
} from '../adapters/axios-interceptor.adapter';
import {
  buildAxiosConfig,
  isAxiosRequestConfig,
  mergeHeaders,
  normalizeAxiosRequest,
  serializeAxiosConfig,
  toUrlEncodedForm,
} from '../adapters/axios-request.adapter';
import { toAxiosLikeResponse } from '../adapters/axios-response.adapter';
import { toAxiosError } from '../errors/axios-error';

let fallbackAgent: UndiciAgent | undefined;

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return !!value && typeof (value as { then?: unknown }).then === 'function';
}

/**
 * Chains one axiosRef interceptor entry onto `source`, matching a single
 * `promise.then(onFulfilled, onRejected)` link in axios' own request/response
 * interceptor chain: `onRejected` only sees a rejection of `source` itself,
 * never one `onFulfilled` raises (that propagates to the *next* link, or
 * uncaught), and an entry with neither handler is a no-op pass-through.
 * Built on real Observables (not Promises) so unsubscribing the outer
 * Observable still tears down (and aborts) an in-flight dispatch reached
 * through one or more interceptors.
 */
function chainStep<T>(
  source: Observable<T>,
  onFulfilled?: (value: T) => T | Promise<T>,
  onRejected?: (error: any) => any,
): Observable<T> {
  if (!onFulfilled && !onRejected) return source;
  return new Observable<T>(subscriber => {
    // Suppresses `source`'s own (synchronous) completion while an async
    // `onFulfilled`/`onRejected` result is still pending, so a same-tick
    // source (e.g. the first link, `of(config)`) can't complete this
    // subscriber before the eventual `.then()` delivers its value.
    let resolving = false;
    const settle = (result: T | Promise<T>): void => {
      if (isPromiseLike<T>(result)) {
        resolving = true;
        result.then(
          value => {
            subscriber.next(value);
            subscriber.complete();
          },
          error => subscriber.error(error),
        );
      } else {
        subscriber.next(result);
        subscriber.complete();
      }
    };
    const subscription = source.subscribe({
      next: value => {
        if (!onFulfilled) {
          subscriber.next(value);
          return;
        }
        try {
          settle(onFulfilled(value));
        } catch (error) {
          subscriber.error(error);
        }
      },
      error: error => {
        if (!onRejected) {
          subscriber.error(error);
          return;
        }
        try {
          settle(onRejected(error));
        } catch (rejectedError) {
          subscriber.error(rejectedError);
        }
      },
      complete: () => {
        if (!resolving) subscriber.complete();
      },
    });
    return () => subscription.unsubscribe();
  });
}

/**
 * The interceptors that actually run for this request, in axios' own
 * execution order: request interceptors last-registered-first (LIFO, axios'
 * default `legacyInterceptorReqResOrdering`), response interceptors
 * first-registered-first (FIFO). `runWhen` (request interceptors only, as in
 * axios) is evaluated once here, against the config as built - before any
 * interceptor in the chain has run - exactly like axios' own filtering pass.
 */
function activeAxiosInterceptors<T>(
  entries: ReadonlyArray<AxiosInterceptorEntry<T> | null>,
  isRequest: boolean,
  config?: AxiosLikeRequestConfig,
): AxiosInterceptorEntry<T>[] {
  const active: AxiosInterceptorEntry<T>[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (isRequest && entry.runWhen && entry.runWhen(config) === false) {
      continue;
    }
    active.push(entry);
  }
  return isRequest ? active.reverse() : active;
}

/**
 * The global dispatcher, when it comes from this copy of undici. Another copy
 * (such as the undici bundled with Node.js 22, which installs itself as the
 * global dispatcher when anything reads the global `fetch` first) can't run
 * this copy's interceptors, so a shared Agent from this copy is used instead.
 */
function compatibleGlobalDispatcher(): Dispatcher {
  const globalDispatcher = getGlobalDispatcher();
  if (globalDispatcher instanceof UndiciDispatcher) {
    return globalDispatcher;
  }
  fallbackAgent ??= new UndiciAgent();
  return fallbackAgent;
}

/**
 * The per-request abort signal passed to undici. undici only needs `aborted`,
 * `reason` and a single 'abort' listener, so this is cheaper than an
 * AbortController (no EventTarget) on every request.
 */
class RequestAbortSignal {
  aborted = false;
  reason: unknown = undefined;
  private listener: (() => void) | undefined;

  addEventListener(_type: 'abort', listener: () => void): void {
    this.listener = listener;
  }

  removeEventListener(): void {
    this.listener = undefined;
  }

  abort(reason?: unknown): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    const listener = this.listener;
    this.listener = undefined;
    listener?.();
  }
}

@Injectable()
export class HttpService {
  private interceptors: Array<HttpInterceptor | HttpInterceptorFunction> = [];
  private _axiosRef: AxiosRef;
  private customDispatcher?: Dispatcher;
  private cookieJar?: CookieJar;
  private redirectDispatchers = new WeakMap<
    Dispatcher,
    Map<number, Dispatcher>
  >();
  // Perf item 2: `createInterceptorHandler` builds a linked list of one
  // handler object per interceptor; that chain never changes shape between
  // requests unless `this.interceptors` itself is replaced or grown, so it's
  // built once and reused until `interceptorsVersion` says otherwise (bumped
  // by `addInterceptor`/`setInterceptors`, module-registered interceptors
  // only - axiosRef's own request/response interceptors run through
  // `runAxiosPipeline` instead, over `axiosRequestInterceptors`/
  // `axiosResponseInterceptors` directly, so they need no such cache).
  private interceptorsVersion = 0;
  private cachedInterceptorHandler?: HttpInterceptorHandler;
  private cachedInterceptorHandlerVersion = -1;
  // axiosRef's own request/response interceptors (registered through
  // `axiosRef.interceptors.request/response.use()`). Unlike `this.interceptors`
  // above, these run over the single axios-shaped config object built by
  // `buildAxiosConfig`/`serializeAxiosConfig`, in axios' own order - see
  // `runAxiosPipeline`.
  private readonly axiosRequestInterceptors =
    createInterceptorStore<AxiosLikeRequestConfig>();
  private readonly axiosResponseInterceptors =
    createInterceptorStore<AxiosLikeResponse>();

  public constructor(
    @Inject(UNDICI_INSTANCE_TOKEN)
    protected readonly instanceOptions: UndiciRequestOptionsType,
    @Optional()
    @Inject(HTTP_MODULE_OPTIONS)
    private readonly moduleOptions?: HttpModuleOptions,
  ) {
    // Initialize interceptors from module options if available
    if (this.moduleOptions?.interceptors) {
      // For now, we'll only handle function interceptors in the constructor
      // Class-based interceptors need to be resolved by the DI container
      this.interceptors = this.moduleOptions.interceptors
        .filter(interceptor => typeof interceptor === 'function')
        .map(interceptor => interceptor as HttpInterceptorFunction);
    }

    // Initialize axios-compatible axiosRef (interceptors, defaults, promise methods)
    this._axiosRef = createAxiosRef(
      this,
      this.axiosRequestInterceptors,
      this.axiosResponseInterceptors,
      this.instanceOptions,
    );

    // Setup custom dispatcher based on axios compatibility options
    this.setupDispatcher();
  }

  private setupDispatcher(): void {
    const options = this.moduleOptions as any;
    if (!options) return;

    let baseDispatcher: Dispatcher | undefined;

    // Handle ProxyAgent first (highest priority)
    if (options.__proxyAgent) {
      baseDispatcher = new ProxyAgent(options.__proxyAgent);
    }
    // Handle custom agent options
    else if (options.__agentOptions) {
      baseDispatcher = new UndiciAgent({
        connections: options.__agentOptions.connections,
        pipelining: options.pipelining || 1,
      });
    }

    // Handle cookie support - wrap existing dispatcher if present
    if (options.__withCredentials) {
      this.cookieJar = new CookieJar();

      // Create cookie agent, optionally wrapping the base dispatcher
      const cookieAgentOptions: any = {
        cookies: { jar: this.cookieJar },
      };

      // If we have a base dispatcher (proxy or custom agent), wrap it
      if (baseDispatcher) {
        cookieAgentOptions.factory = () => baseDispatcher;
      }

      this.customDispatcher = new CookieAgent(cookieAgentOptions);
    } else if (baseDispatcher) {
      this.customDispatcher = baseDispatcher;
    }

    if (this.customDispatcher) {
      // Set as default dispatcher in instance options
      this.instanceOptions.dispatcher = this.customDispatcher;
    }
  }

  public setGlobalDispatcher(dispatcher: Dispatcher): void {
    this.instanceOptions.dispatcher = dispatcher;
  }

  /**
   * Axios-style call form, as in `@nestjs/axios`: `request({ url, method, data, params, ... })`
   */
  public request<T = any>(
    config: AxiosCompatibleRequestConfig,
  ): Observable<AxiosLikeResponse<T>>;
  public request<T = any>(
    url: string | URL | UrlObject,
    options?: HttpRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  public request<T = any>(
    urlOrConfig: string | URL | UrlObject | AxiosCompatibleRequestConfig,
    requestOptions?: HttpRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    // `defer()` makes the Observable cold and re-runs everything below (config
    // normalization, the axiosRef request interceptors, the actual request)
    // on every subscription, as `@nestjs/axios`' `makeObservable` does. This
    // matters for `get().pipe(retry())`: each attempt must build its own
    // headers/config rather than reusing the first attempt's.
    return defer(() => {
      if (!this.hasAxiosPipeline(urlOrConfig, requestOptions)) {
        return this.dispatchFastPath<T>(urlOrConfig, requestOptions);
      }
      // axiosRef request/response interceptors (or a transformRequest/
      // transformResponse) are in play: build the single axios-shaped config
      // object up front and run it through the axios pipeline, instead of
      // the undici-options fast path below.
      const config = buildAxiosConfig(urlOrConfig, requestOptions, {
        defaults: this._axiosRef.defaults,
        instanceOptions: this.instanceOptions,
      });
      return this.runAxiosPipeline<T>(config);
    });
  }

  /**
   * True when this request needs the axiosRef pipeline (`runAxiosPipeline`):
   * a live axiosRef request/response interceptor, or a `transformRequest`/
   * `transformResponse` (module- or request-level). A plain request with
   * none of these keeps the fast path below, which never builds a full axios
   * config object.
   */
  private hasAxiosPipeline(
    urlOrConfig: string | URL | UrlObject | AxiosCompatibleRequestConfig,
    requestOptions?: HttpRequestOptions,
  ): boolean {
    if (
      this.axiosRequestInterceptors.entries.some(Boolean) ||
      this.axiosResponseInterceptors.entries.some(Boolean)
    ) {
      return true;
    }
    const moduleOpts = this.moduleOptions as any;
    if (moduleOpts?.transformRequest || moduleOpts?.transformResponse) {
      return true;
    }
    const configForm: any = isAxiosRequestConfig(urlOrConfig)
      ? urlOrConfig
      : undefined;
    const opts: any = requestOptions;
    return !!(
      configForm?.transformRequest ||
      configForm?.transformResponse ||
      opts?.transformRequest ||
      opts?.transformResponse
    );
  }

  /**
   * The axiosRef pipeline: run the axios-shaped config through the request
   * interceptors (LIFO), dispatch it, then the response interceptors (FIFO) -
   * see `chainStep`/`activeAxiosInterceptors`. Any module-registered generic
   * interceptor (`this.interceptors`, e.g. size limits) still runs around the
   * actual dispatch, via `executeInterceptorChain`.
   */
  private runAxiosPipeline<T = any>(
    config: AxiosLikeRequestConfig,
  ): Observable<AxiosLikeResponse<T>> {
    const requestChain = activeAxiosInterceptors(
      this.axiosRequestInterceptors.entries,
      true,
      config,
    );
    const responseChain = activeAxiosInterceptors(
      this.axiosResponseInterceptors.entries,
      false,
    );

    let config$: Observable<AxiosLikeRequestConfig> = of(config);
    for (const entry of requestChain) {
      config$ = chainStep(config$, entry.fulfilled, entry.rejected);
    }

    let response$: Observable<AxiosLikeResponse> = config$.pipe(
      mergeMap(finalConfig =>
        this.executeInterceptorChain(serializeAxiosConfig(finalConfig)),
      ),
    );
    for (const entry of responseChain) {
      response$ = chainStep(response$, entry.fulfilled, entry.rejected);
    }
    return response$ as Observable<AxiosLikeResponse<T>>;
  }

  /**
   * The existing fast path (no axiosRef interceptors, no transforms): builds
   * the undici dispatch options directly, without ever materialising a full
   * axios config object. `response.config`/`error.config` are still correct
   * when read - `dispatchFastPath` attaches the cheap fields
   * `normalizeAxiosRequest` already computed so the config can be built
   * lazily (see `attachLazyAxiosConfig`), on first access.
   */
  private dispatchFastPath<T = any>(
    urlOrConfig: string | URL | UrlObject | AxiosCompatibleRequestConfig,
    requestOptions?: HttpRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    // Apply axios semantics (config form, baseURL, params, data, headers, auth, ...)
    const { url, options, raw } = normalizeAxiosRequest(
      urlOrConfig,
      requestOptions,
      {
        defaults: this._axiosRef.defaults,
        instanceOptions: this.instanceOptions,
      },
    ) as {
      url: string | URL | UrlObject;
      options: Omit<HttpRequestOptions, 'headers'> &
        Pick<Dispatcher.RequestOptions, 'headers'>;
      raw: { url: any; baseURL?: string; params?: any; method: string };
    };

    // Handle timeout option for axios compatibility
    const { timeout, ...restOptions } = options || {};
    const mergedOptions = {
      ...this.instanceOptions,
      ...restOptions,
    };

    // Map timeout to undici's timeout options
    if (timeout !== undefined) {
      mergedOptions.headersTimeout = timeout;
      mergedOptions.bodyTimeout = timeout;
    }

    // Pass through size limit options from module config
    const moduleOpts = this.moduleOptions as any;
    if (moduleOpts?.maxBodyLength !== undefined) {
      (mergedOptions as any).maxBodyLength = moduleOpts.maxBodyLength;
    }
    if (moduleOpts?.maxContentLength !== undefined) {
      (mergedOptions as any).maxContentLength = moduleOpts.maxContentLength;
    }

    // Handle axios-specific options from module configuration
    let finalUrl = url;
    const axiosCompat = (this.moduleOptions as any)?.__axiosCompat;

    if (axiosCompat?.baseURL) {
      // Apply baseURL if the URL is relative
      const urlString = typeof url === 'string' ? url : url.toString();
      if (
        !urlString.startsWith('http://') &&
        !urlString.startsWith('https://')
      ) {
        finalUrl = new URL(urlString, axiosCompat.baseURL).toString();
      }
    }

    // Handle socket path
    if (moduleOpts?.__socketPath) {
      // Transform URL to use unix socket
      const urlString =
        typeof finalUrl === 'string' ? finalUrl : finalUrl.toString();
      const urlObj = new URL(urlString);
      finalUrl = `unix:${moduleOpts.__socketPath}:${urlObj.pathname}${urlObj.search}`;
    }

    // Create the request object for interceptors
    const interceptorRequest: HttpInterceptorRequest = {
      url: finalUrl,
      options: mergedOptions,
    };
    // Cheap fields for a lazily-built `response.config`/`error.config`
    // (see `attachLazyAxiosConfig`) - no AxiosHeaders wrap, no combined
    // URL, just the references `normalizeAxiosRequest` already computed.
    (interceptorRequest as any).raw = raw;

    // Create the interceptor chain (always includes axios adapter)
    return this.executeInterceptorChain(interceptorRequest);
  }

  /**
   * End of the interceptor chain: performs the undici request and converts
   * the response to the axios-compatible format (the built-in axios response
   * adapter, applied inline to avoid an extra Observable/operator layer per
   * request).
   */
  private executeRequest(
    interceptorRequest: HttpInterceptorRequest,
  ): Observable<AxiosLikeResponse> {
    return new Observable<AxiosLikeResponse>(subscriber => {
      // Ensure we use the configured dispatcher (for cookies, proxy, etc.)
      const { maxRedirections, ...requestOptions } =
        interceptorRequest.options as typeof interceptorRequest.options & {
          maxRedirections?: number;
        };
      const dispatcher =
        this.customDispatcher ||
        requestOptions.dispatcher ||
        this.instanceOptions.dispatcher;

      // Abort the undici request when the Observable is unsubscribed before
      // it settles (rxjs `timeout()`, `switchMap`, `takeUntil`, `race`, ...),
      // matching `@nestjs/axios`' `makeObservable` teardown. Each subscription
      // gets its own signal (so `defer()`/`retry()` attempts don't share one),
      // combined with any user-supplied signal (already merged with
      // `cancelToken` by `normalizeAxiosRequest`). `settled` flips to true once
      // the response (or, for a `stream` response, the headers) has been handed
      // to the subscriber; after that neither the teardown nor the user signal
      // may abort, or a stream body the caller is still reading would break.
      const userSignal = requestOptions.signal as AbortSignal | undefined;
      const abortSignal = new RequestAbortSignal();
      let settled = false;
      let onUserAbort: (() => void) | undefined;
      if (userSignal) {
        if (userSignal.aborted) {
          abortSignal.abort(userSignal.reason);
        } else {
          onUserAbort = () => {
            if (!settled) abortSignal.abort(userSignal.reason);
          };
          userSignal.addEventListener('abort', onUserAbort, { once: true });
        }
      }

      const options = {
        ...requestOptions,
        ...this.resolveRedirectOptions(dispatcher, maxRedirections),
        signal: abortSignal as any,
      };

      // Perf item 4: one `.then(onFulfilled, onRejected)` registration
      // instead of `.then().then().catch()` (3 registrations, each its own
      // Promise and microtask hop). `request(...)` itself stays a bare,
      // un-awaited call: if it throws *synchronously* (e.g. an invalid URL),
      // that must keep propagating straight out of this subscriber function
      // for rxjs' Observable constructor to catch and forward raw, exactly
      // as `@nestjs/axios` leaves it un-wrapped for the same input - wrapping
      // it in a try/catch here (or an `await`) would route it through
      // `fail`/`toAxiosError` instead, an observable behaviour change.
      const fail = (error: unknown): void => {
        settled = true;
        subscriber.error(toAxiosError(error, interceptorRequest));
      };
      request(interceptorRequest.url, options).then(async res => {
        try {
          const axiosRes = await toAxiosLikeResponse(interceptorRequest, res);
          settled = true;
          subscriber.next(axiosRes);
          subscriber.complete();
        } catch (error) {
          fail(error);
        }
      }, fail);

      return () => {
        if (!settled) abortSignal.abort();
        // Don't leave a listener on a long-lived user signal for every request
        if (onUserAbort) userSignal!.removeEventListener('abort', onUserAbort);
      };
    });
  }

  /**
   * Undici >= 7 rejects the `maxRedirections` request option and requires the
   * redirect interceptor instead. Compose it onto the dispatcher when
   * available (cached per dispatcher), otherwise fall back to the legacy
   * request option supported by older undici versions.
   */
  private resolveRedirectOptions(
    dispatcher: Dispatcher | undefined,
    maxRedirections: number | undefined,
  ): { dispatcher?: Dispatcher; maxRedirections?: number } {
    if (maxRedirections === undefined || maxRedirections === null) {
      return { dispatcher };
    }

    const base = dispatcher || compatibleGlobalDispatcher();
    if (
      typeof undiciInterceptors?.redirect !== 'function' ||
      typeof base.compose !== 'function'
    ) {
      return { dispatcher, maxRedirections };
    }

    // Without redirect handling the 3xx response is returned as-is, which
    // matches axios' `maxRedirects: 0` behaviour.
    if (maxRedirections <= 0) {
      return { dispatcher };
    }

    let byLimit = this.redirectDispatchers.get(base);
    if (!byLimit) {
      byLimit = new Map();
      this.redirectDispatchers.set(base, byLimit);
    }
    let composed = byLimit.get(maxRedirections);
    if (!composed) {
      composed = base.compose(undiciInterceptors.redirect({ maxRedirections }));
      byLimit.set(maxRedirections, composed);
    }
    return { dispatcher: composed };
  }

  private executeInterceptorChain<T = any>(
    request: HttpInterceptorRequest,
  ): Observable<any> {
    // The axios response adapter always runs last, inside executeRequest()
    if (
      !this.cachedInterceptorHandler ||
      this.cachedInterceptorHandlerVersion !== this.interceptorsVersion
    ) {
      this.cachedInterceptorHandler = this.createInterceptorHandler<T>(
        0,
        this.interceptors,
      );
      this.cachedInterceptorHandlerVersion = this.interceptorsVersion;
    }
    return this.cachedInterceptorHandler.handle(request);
  }

  private createInterceptorHandler<T = any>(
    index: number,
    interceptors: Array<HttpInterceptor | HttpInterceptorFunction>,
  ): HttpInterceptorHandler {
    if (index >= interceptors.length) {
      // End of chain - execute the actual request
      return {
        handle: (request: HttpInterceptorRequest) =>
          this.executeRequest(request),
      };
    }

    const interceptor = interceptors[index];
    const nextHandler = this.createInterceptorHandler<T>(
      index + 1,
      interceptors,
    );

    return {
      handle: (request: HttpInterceptorRequest) => {
        if (typeof interceptor === 'function') {
          return interceptor(request, nextHandler);
        } else {
          return interceptor.intercept(request, nextHandler);
        }
      },
    };
  }

  public get undiciRef(): UndiciRequestOptionsType {
    return this.instanceOptions;
  }

  /**
   * Axios-compatible reference for interceptor management
   * Provides axios-style API: httpService.axiosRef.interceptors.request.use()
   */
  public get axiosRef(): AxiosRef {
    return this._axiosRef;
  }

  public addInterceptor(
    interceptor: HttpInterceptor | HttpInterceptorFunction,
  ): void {
    this.interceptors.push(interceptor);
    this.interceptorsVersion++;
  }

  public setInterceptors(
    interceptors: Array<HttpInterceptor | HttpInterceptorFunction>,
  ): void {
    this.interceptors = interceptors;
    this.interceptorsVersion++;
  }

  public get interceptorCount(): number {
    // Module-registered interceptors, plus live axiosRef request/response
    // interceptors (which no longer live in `this.interceptors` - see
    // `runAxiosPipeline`), plus the axios response adapter, always added.
    const axiosCount =
      this.axiosRequestInterceptors.entries.filter(Boolean).length +
      this.axiosResponseInterceptors.entries.filter(Boolean).length;
    return this.interceptors.length + axiosCount + 1;
  }

  /**
   * Convenience method for GET requests
   * @param url The URL to request
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public get<T = any>(
    url: string | URL | UrlObject,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'GET' });
  }

  /**
   * Convenience method for POST requests
   * @param url The URL to request
   * @param data The data to send in the body
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public post<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'POST', data });
  }

  /**
   * Convenience method for PUT requests
   * @param url The URL to request
   * @param data The data to send in the body
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public put<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'PUT', data });
  }

  /**
   * Convenience method for DELETE requests
   * @param url The URL to request
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public delete<T = any>(
    url: string | URL | UrlObject,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'DELETE' });
  }

  /**
   * Convenience method for PATCH requests
   * @param url The URL to request
   * @param data The data to send in the body
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public patch<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'PATCH', data });
  }

  /**
   * Convenience method for HEAD requests
   * @param url The URL to request
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public head<T = any>(
    url: string | URL | UrlObject,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'HEAD' });
  }

  /**
   * Convenience method for OPTIONS requests
   * @param url The URL to request
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public options<T = any>(
    url: string | URL | UrlObject,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.request(url, { ...config, method: 'OPTIONS' });
  }

  /**
   * Convenience method for POST requests with form data
   * @param url The URL to request
   * @param data The form data to send
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public postForm<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.formRequest('POST', url, data, config);
  }

  /**
   * Convenience method for PUT requests with form data
   * @param url The URL to request
   * @param data The form data to send
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public putForm<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.formRequest('PUT', url, data, config);
  }

  /**
   * Convenience method for PATCH requests with form data
   * @param url The URL to request
   * @param data The form data to send
   * @param config Optional configuration
   * @returns Observable that emits AxiosLikeResponse<T>
   */
  public patchForm<T = any>(
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    return this.formRequest('PATCH', url, data, config);
  }

  /**
   * Shared implementation of postForm/putForm/patchForm. FormData bodies are
   * sent as multipart; everything else is url-encoded.
   */
  private formRequest<T = any>(
    method: 'POST' | 'PUT' | 'PATCH',
    url: string | URL | UrlObject,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>> {
    const isMultipart =
      data?.[Symbol.toStringTag] === 'FormData' ||
      typeof data?.getHeaders === 'function';
    if (isMultipart) {
      return this.request(url, { ...config, method, data });
    }
    return this.request(url, {
      ...config,
      method,
      data: toUrlEncodedForm(data),
      headers: mergeHeaders(
        { 'Content-Type': 'application/x-www-form-urlencoded' },
        config?.headers,
      ),
    });
  }
}
