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
  HttpRequestOptions,
  AxiosLikeResponse,
  AxiosRef,
} from '../interfaces';
import { createAxiosRef } from '../adapters/axios-ref.factory';
import {
  mergeHeaders,
  normalizeAxiosRequest,
  toUrlEncodedForm,
} from '../adapters/axios-request.adapter';
import { toAxiosLikeResponse } from '../adapters/axios-response.adapter';
import { toAxiosError } from '../errors/axios-error';

let fallbackAgent: UndiciAgent | undefined;

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
      interceptor => this.addInterceptor(interceptor),
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
      // Apply axios semantics (config form, baseURL, params, data, headers, auth, ...)
      const { url, options } = normalizeAxiosRequest(
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

      // Create the interceptor chain (always includes axios adapter)
      return this.executeInterceptorChain(interceptorRequest);
    });
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
      // matching `@nestjs/axios`' `makeObservable` teardown. A fresh
      // AbortController is created per subscription (so `defer()`/`retry()`
      // attempts don't share one), and combined with any user-supplied
      // signal (already merged with `cancelToken` by `normalizeAxiosRequest`)
      // via a plain listener rather than `AbortSignal.any`, which is slower.
      // `settled` flips to true once the response (or, for a `stream`
      // response, the headers) has been handed to the subscriber, at which
      // point rxjs's own teardown runs but must no longer abort.
      const userSignal = requestOptions.signal as AbortSignal | undefined;
      const controller = new AbortController();
      let settled = false;
      if (userSignal) {
        if (userSignal.aborted) {
          controller.abort(userSignal.reason);
        } else {
          userSignal.addEventListener(
            'abort',
            () => controller.abort(userSignal.reason),
            { once: true },
          );
        }
      }

      const options = {
        ...requestOptions,
        ...this.resolveRedirectOptions(dispatcher, maxRedirections),
        signal: controller.signal,
      };

      request(interceptorRequest.url, options)
        .then(res => toAxiosLikeResponse(interceptorRequest, res))
        .then(res => {
          settled = true;
          subscriber.next(res);
          subscriber.complete();
        })
        .catch(error => {
          settled = true;
          subscriber.error(toAxiosError(error, interceptorRequest));
        });

      return () => {
        if (!settled) controller.abort();
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
    const handler = this.createInterceptorHandler<T>(0, this.interceptors);
    return handler.handle(request);
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
  }

  public setInterceptors(
    interceptors: Array<HttpInterceptor | HttpInterceptorFunction>,
  ): void {
    this.interceptors = interceptors;
  }

  public get interceptorCount(): number {
    // Include the axios response adapter which is always added
    return this.interceptors.length + 1;
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
