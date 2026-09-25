import type { IncomingHttpHeaders } from 'http';
import type { Dispatcher } from 'undici';
import type {
  AxiosHeaders,
  AxiosRequestHeaders,
  RawAxiosHeaders,
} from './axios-headers';

/**
 * Axios-compatible response structure
 * This interface mimics the AxiosResponse structure to provide compatibility
 */
export interface AxiosLikeResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: IncomingHttpHeaders | Record<string, string | string[]>;
  config: AxiosLikeRequestConfig;
  request?: any;
}

/**
 * Axios-compatible request configuration
 */
export interface AxiosLikeRequestConfig {
  url?: string;
  baseURL?: string;
  method?: string;
  headers?: AxiosRequestHeaders | AxiosHeaders;
  params?: any;
  paramsSerializer?: AxiosParamsSerializer;
  data?: any;
  timeout?: number;
  responseType?: 'json' | 'text' | 'stream' | 'arraybuffer' | 'blob';
  maxRedirects?: number;
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
  signal?: AbortSignal;
  /** Custom fields set by an interceptor (e.g. a retry flag) survive a round trip through `response.config` / `error.config`. */
  [key: string]: any;
}

/**
 * Extended Undici ResponseData with parsed body
 */
export interface UndiciResponseWithParsedBody extends Dispatcher.ResponseData {
  parsedBody?: any;
}

/**
 * axios `paramsSerializer`: a function or an options object
 */
export type AxiosParamsSerializer =
  | ((params: any) => string)
  | {
      serialize?: (params: any, options?: any) => string;
      encode?: (value: any) => string;
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

export type AxiosResponseType =
  'json' | 'text' | 'stream' | 'arraybuffer' | 'blob' | 'document';

/**
 * Axios-compatible request options that can be used with HttpService methods.
 * Extends Undici's RequestOptions with the per-request axios options this
 * library understands.
 */
export interface AxiosCompatibleRequestOptions extends Omit<
  Dispatcher.RequestOptions,
  'origin' | 'path' | 'method' | 'body' | 'headers'
> {
  headers?:
    | Dispatcher.RequestOptions['headers']
    | AxiosHeaders
    | RawAxiosHeaders
    | Record<string, string | string[] | number | boolean | null | undefined>;
  body?: Dispatcher.RequestOptions['body'];
  timeout?: number;
  baseURL?: string;
  params?: any;
  paramsSerializer?: AxiosParamsSerializer;
  /** Request body, serialised like axios (object => JSON, URLSearchParams, FormData, Buffer, string) */
  data?: any;
  auth?: { username: string; password: string };
  responseType?: AxiosResponseType;
  validateStatus?: ((status: number) => boolean) | null;
  maxRedirects?: number;
  maxContentLength?: number;
  /** `false` disables response decompression (gzip/br/deflate). Default: decompress. */
  decompress?: boolean;
  cancelToken?: AxiosCancelTokenLike;
  maxBodyLength?: number;
  transformRequest?:
    | ((data: any, headers?: any) => any)
    | Array<(data: any, headers?: any) => any>;
  transformResponse?:
    | ((data: any, headers?: any, status?: number) => any)
    | Array<(data: any, headers?: any, status?: number) => any>;
}

/**
 * Config accepted by `httpService.request(config)`, mirroring
 * `@nestjs/axios`' `request<T>(config: AxiosRequestConfig)`.
 */
export interface AxiosCompatibleRequestConfig extends AxiosCompatibleRequestOptions {
  url: string | URL;
  method?: string;
}

/**
 * Options accepted by `httpService.request(url, options)`: undici request
 * options plus the supported axios per-request options.
 */
export type HttpRequestOptions = AxiosCompatibleRequestOptions & {
  dispatcher?: Dispatcher;
  method?: string;
  maxRedirections?: number;
};
