import type { Dispatcher } from 'undici';
import type { AxiosHeaders } from './axios-headers';

/**
 * The minimal shape axios itself requires for `signal` (its own
 * `GenericAbortSignal`) - narrower than DOM's `AbortSignal` (`onabort`/
 * `addEventListener`/`removeEventListener` are all optional there). A real
 * `AbortSignal` (what this library's own request path always passes/reads)
 * satisfies this too, so accepting the union costs nothing at runtime; it
 * just also accepts the narrower shape axios' own types use, so a variable
 * typed with axios' `AxiosRequestConfig` is assignable to `AxiosLikeRequestConfig`.
 */
export interface AxiosLikeAbortSignal {
  readonly aborted: boolean;
  onabort?: ((...args: any[]) => any) | null;
  addEventListener?: (...args: any[]) => any;
  removeEventListener?: (...args: any[]) => any;
}

/**
 * Axios-compatible request configuration, and the single type this library
 * uses everywhere a request-level config is accepted: `request(config)`,
 * `request(url, options)`, `get`/`post`/etc.'s `config` argument, axiosRef's
 * promise methods, and the object axiosRef request/response interceptors
 * see. It replaces four overlapping types this package used to export
 * (`AxiosLikeRequestConfig`, `AxiosCompatibleRequestOptions`,
 * `AxiosCompatibleRequestConfig`, `HttpRequestOptions`) - plan.md phase 2
 * "types: axios interop".
 *
 * `url` and `method` are optional here, exactly like axios' own
 * `AxiosRequestConfig`: `request(config)` doesn't actually require `url` at
 * the type level either (a `baseURL` alone, or an interceptor that fills it
 * in, is enough at runtime) - this is what makes `ours.request(config)`
 * assignable from a variable typed with axios' own `AxiosRequestConfig`.
 *
 * `headers` (and the other "shape is whatever the caller wants" fields
 * below) are typed as `Record<string, any> | AxiosHeaders` rather than a
 * hand-derived mirror of axios' own header types: that keeps this type
 * mutually assignable with axios' `AxiosRequestConfig`/`AxiosResponse`
 * header types (including the method-keyed `{ common: {...}, post: {...} }`
 * shape, whose values are themselves `AxiosHeaders` instances) without
 * importing axios' types (`axios` is an optional peer - consumers without it
 * installed must still get useful typechecking). Precise typo-catching is
 * reserved for `HttpModuleOptions`' own keys (see `types/http-module.type.ts`),
 * not header contents, which nobody types out by hand in a way a typo check
 * would catch.
 */
export interface AxiosLikeRequestConfig<D = any> {
  url?: string | URL;
  method?: string;
  baseURL?: string;
  headers?: Record<string, any> | AxiosHeaders;
  params?: any;
  paramsSerializer?: AxiosParamsSerializer;
  /** Request body, serialised like axios (object => JSON, URLSearchParams, FormData, Buffer, string) */
  data?: D;
  timeout?: number;
  responseType?: AxiosResponseType;
  maxRedirects?: number;
  /** Same spelling undici's own redirect interceptor uses; an alias for `maxRedirects` read when `maxRedirects` itself is unset. */
  maxRedirections?: number;
  /**
   * Same as axios: called before each redirect hop with a mutable
   * `options` object (`protocol`, `hostname`, `port`, `path`, `method`,
   * `headers`) plus `responseDetails` (the 3xx that triggered the hop) and
   * `requestDetails` (the request that just ran). Mutations to `options`
   * are applied to the next hop.
   */
  beforeRedirect?: (
    options: Record<string, any>,
    responseDetails: { headers: Record<string, any>; statusCode: number },
    requestDetails: {
      url: string;
      method: string;
      headers: Record<string, any>;
    },
  ) => void;
  validateStatus?: ((status: number) => boolean) | null;
  auth?: { username: string; password: string };
  decompress?: boolean;
  maxContentLength?: number;
  maxBodyLength?: number;
  transformRequest?:
    | ((data: any, headers?: any) => any)
    | Array<(data: any, headers?: any) => any>;
  transformResponse?:
    | ((data: any, headers?: any, status?: number) => any)
    | Array<(data: any, headers?: any, status?: number) => any>;
  cancelToken?: AxiosCancelTokenLike;
  signal?: AbortSignal | AxiosLikeAbortSignal;
  /**
   * Unix domain socket path (module- or request-level). Applied to the
   * dispatcher (`Agent({ connect: { socketPath } })`, cached per path); the
   * URL's host is still used for the `Host` header, as in axios.
   */
  socketPath?: string | null;
  /** A per-request undici `Dispatcher`; wins over any module-built one. */
  dispatcher?: Dispatcher;
  /** Accepted for axios compatibility; a no-op, like axios itself on Node.js. */
  withCredentials?: boolean;
  /** Custom fields set by an interceptor (e.g. a retry flag) survive a round trip through `response.config` / `error.config`. */
  [key: string]: any;
}

/**
 * `AxiosLikeRequestConfig` with `headers` required, matching axios'
 * `InternalAxiosRequestConfig`: the config axiosRef request interceptors,
 * `response.config` and `error.config` carry always has `headers` populated,
 * so `config.headers['Authorization'] = ...` and `config.headers.set(...)`
 * type-check under `strict` without a null check first.
 */
export interface InternalAxiosLikeRequestConfig<
  D = any,
> extends AxiosLikeRequestConfig<D> {
  /**
   * Non-optional (unlike the base type's `headers?:`): axiosRef request
   * interceptors, `response.config` and `error.config` always have it
   * populated (`buildAxiosConfig`/`buildLazyAxiosConfig` never leave it
   * `undefined`), so `config.headers['Authorization'] = ...` and
   * `config.headers.set(...)` type-check under `strict` without a null
   * check first - matching axios' own `InternalAxiosRequestConfig.headers:
   * AxiosRequestHeaders` (also non-optional). Still `Record<string, any> |
   * AxiosHeaders`, not narrowed to just `AxiosHeaders`: our `AxiosHeaders`
   * class doesn't mirror every one of axios' own class's overloaded
   * `set`/`get`/`toJSON` call shapes (only the ones this library itself
   * needs), so narrowing here would make this type *stricter* than what
   * axios' own `InternalAxiosRequestConfig` requires, rejecting plain test
   * fixtures (`{ headers: {} }`) for no compatibility gain - see
   * `tests/types/usage.ts` cases 5/9/15, still tracked under "feat(axiosRef):
   * make it a real axios instance" (full AxiosHeaders).
   */
  headers: Record<string, any> | AxiosHeaders;
}

/**
 * Axios-compatible response structure. Structurally assignable to axios'
 * own `AxiosResponse<T, D>` (and vice versa - see the class doc above), so
 * `Observable<AxiosResponse<T>>`-typed code written against `@nestjs/axios`
 * keeps compiling against this library, including `of({...} as AxiosResponse)`
 * test mocks.
 */
export interface AxiosLikeResponse<T = any, D = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, any>;
  config: InternalAxiosLikeRequestConfig<D>;
  request?: any;
}

/**
 * axios `paramsSerializer`: a function or an options object
 */
export type AxiosParamsSerializer =
  | ((params: any) => string)
  | {
      serialize?: (params: any, options?: any) => string;
      /** `value` and, as axios' own `ParamEncoder` also passes, the default encoder to fall back to. */
      encode?: (...args: any[]) => string;
      /** `false` (default): `a[]=1`, `true`: `a[0]=1`, `null`: `a=1` */
      indexes?: boolean | null;
      dots?: boolean;
    };

/**
 * Minimal shape of an axios `CancelToken` (deprecated in axios, still common)
 */
export interface AxiosCancelTokenLike {
  reason?: any;
  promise?: Promise<any>;
  subscribe?(listener: (reason: any) => void): void;
}

/** `'document'`/`'formdata'` are accepted for axios type compatibility (browser-only; not implemented on Node.js). */
export type AxiosResponseType =
  'json' | 'text' | 'stream' | 'arraybuffer' | 'blob' | 'document' | 'formdata';
