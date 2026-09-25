import { firstValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';
import type {
  AxiosCompatibleRequestConfig,
  AxiosCompatibleRequestOptions,
  AxiosLikeResponse,
  AxiosRef,
  AxiosRefDefaults,
  HttpInterceptorFunction,
} from '../interfaces';
import {
  createAxiosRequestInterceptorManager,
  createAxiosResponseInterceptorManager,
} from './axios-interceptor.adapter';
import { SUPPORTED_CONTENT_ENCODINGS } from './axios-response-type.adapter';
import { HEADERS_VERSION } from './axios-request.adapter';
import { LIBRARY_VERSION } from '../../../version';

/** axios' default `Accept`, unchanged since it isn't per-service configurable. */
const DEFAULT_ACCEPT = 'application/json, text/plain, */*';

const METHOD_HEADER_BUCKETS = [
  'common',
  'get',
  'delete',
  'head',
  'options',
  'post',
  'put',
  'patch',
] as const;

/**
 * Wraps one header bucket (`headers.common`, `headers.post`, ...) so that
 * `set`/`delete` on it (including bracket notation, e.g.
 * `defaults.headers.common['X'] = 'y'`) bump the shared version counter.
 */
function trackHeaderBucket(
  target: Record<string, any>,
  bump: () => void,
): Record<string, any> {
  return new Proxy(target, {
    set(t, prop, value, receiver) {
      const ok = Reflect.set(t, prop, value, receiver);
      if (ok) bump();
      return ok;
    },
    deleteProperty(t, prop) {
      const had = Object.prototype.hasOwnProperty.call(t, prop);
      const ok = Reflect.deleteProperty(t, prop);
      if (ok && had) bump();
      return ok;
    },
  });
}

/**
 * Wraps the `defaults.headers` container: known method buckets are returned
 * (and kept) as version-tracked Proxies (`trackHeaderBucket`), replacing a
 * bucket wholesale (`defaults.headers.common = {...}`) re-wraps the new
 * value, and any other write (a flat header key straight on `headers`, e.g.
 * `defaults.headers['X-Flat'] = 'f'`) bumps the version too.
 */
function trackHeaders(
  raw: Record<string, any>,
  bump: () => void,
): Record<string, any> {
  const buckets = new Map<string, Record<string, any>>();
  for (const key of METHOD_HEADER_BUCKETS) {
    buckets.set(key, trackHeaderBucket(raw[key] ?? {}, bump));
  }

  return new Proxy(raw, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && buckets.has(prop)) {
        return buckets.get(prop);
      }
      return Reflect.get(t, prop, receiver);
    },
    set(t, prop, value, receiver) {
      if (typeof prop === 'string' && buckets.has(prop)) {
        const plain = value && typeof value === 'object' ? value : ({} as any);
        buckets.set(prop, trackHeaderBucket(plain, bump));
        const ok = Reflect.set(t, prop, plain, receiver);
        bump();
        return ok;
      }
      const ok = Reflect.set(t, prop, value, receiver);
      if (ok) bump();
      return ok;
    },
    deleteProperty(t, prop) {
      if (typeof prop === 'string' && buckets.has(prop)) {
        buckets.set(prop, trackHeaderBucket({}, bump));
      }
      const had = Object.prototype.hasOwnProperty.call(t, prop);
      const ok = Reflect.deleteProperty(t, prop);
      if (ok && had) bump();
      return ok;
    },
  });
}

/**
 * axios sends `axios/<version>`; this library names itself the same way so
 * requests aren't silently anonymous. It's still just a default: override it
 * per service the axios way, `axiosRef.defaults.headers.common['User-Agent']
 * = '...'`, or per module/request headers (see `createAxiosRefDefaults`).
 */
const DEFAULT_USER_AGENT = `nestjs-axios-undici/${LIBRARY_VERSION}`;

type BodylessMethod = 'get' | 'delete' | 'head' | 'options';
type BodyMethod = 'post' | 'put' | 'patch';

/**
 * The HttpService surface used to back the promise-based axiosRef methods.
 */
export interface AxiosRefHost {
  request<T = any>(
    config: AxiosCompatibleRequestConfig,
  ): Observable<AxiosLikeResponse<T>>;
  get<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  delete<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  head<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  options<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  post<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  put<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
  patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Observable<AxiosLikeResponse<T>>;
}

/**
 * Creates the `defaults` object exposed as `httpService.axiosRef.defaults`.
 */
export function createAxiosRefDefaults(
  moduleOptions?: Record<string, any>,
): AxiosRefDefaults {
  // axios' default request headers, matched as closely as the docs allow
  // (see docs/axios-supported-options.md). Seeded into `headers.common` so
  // they're visible and overridable through `axiosRef.defaults` the same way
  // axios' own defaults are; module `headers` and per-request `headers`
  // still win (see `normalizeAxiosRequest`).
  const common: Record<string, string> = {
    Accept: DEFAULT_ACCEPT,
    'User-Agent': DEFAULT_USER_AGENT,
  };
  // Only advertised when decompression is on for this service (module-level
  // `decompress`, default true) - no point asking a server for a body this
  // library won't decompress.
  if (moduleOptions?.decompress !== false) {
    common['Accept-Encoding'] = SUPPORTED_CONTENT_ENCODINGS;
  }

  const versionRef = { v: 0 };
  const bump = (): void => {
    versionRef.v++;
  };
  const headers = trackHeaders(
    {
      common,
      get: {},
      delete: {},
      head: {},
      options: {},
      post: {},
      put: {},
      patch: {},
    },
    bump,
  );

  const defaults: AxiosRefDefaults = {
    baseURL: moduleOptions?.baseURL,
    headers: headers as AxiosRefDefaults['headers'],
  };
  // Non-enumerable so it never shows up in `Object.keys`/`toEqual` comparisons
  // of `defaults` (nothing currently compares the whole object, but headers
  // sub-buckets are compared directly in tests).
  Object.defineProperty(defaults, HEADERS_VERSION, {
    value: versionRef,
    enumerable: false,
  });
  return defaults;
}

/**
 * Builds the axios-instance-like `axiosRef` for an HttpService: interceptors
 * (with working eject/clear), live `defaults`, and promise-returning request
 * methods (`axiosRef.get(url)` resolves like `axios.get(url)`).
 */
export function createAxiosRef(
  host: AxiosRefHost,
  addInterceptor: (interceptor: HttpInterceptorFunction) => void,
  moduleOptions?: Record<string, any>,
): AxiosRef {
  const bodyless =
    (method: BodylessMethod) =>
    <T = any>(url: string, config?: AxiosCompatibleRequestOptions) =>
      firstValueFrom(host[method]<T>(url, config));
  const withBody =
    (method: BodyMethod) =>
    <T = any>(
      url: string,
      data?: any,
      config?: AxiosCompatibleRequestOptions,
    ) =>
      firstValueFrom(host[method]<T>(url, data, config));

  return {
    interceptors: {
      request: createAxiosRequestInterceptorManager(addInterceptor),
      response: createAxiosResponseInterceptorManager(addInterceptor),
    },
    defaults: createAxiosRefDefaults(moduleOptions),
    request: <T = any>(config: AxiosCompatibleRequestConfig) =>
      firstValueFrom(host.request<T>(config)),
    get: bodyless('get'),
    delete: bodyless('delete'),
    head: bodyless('head'),
    options: bodyless('options'),
    post: withBody('post'),
    put: withBody('put'),
    patch: withBody('patch'),
  };
}
