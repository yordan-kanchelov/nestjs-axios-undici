import type { Observable } from 'rxjs';
import type {
  HttpInterceptor,
  HttpInterceptorFunction,
} from './http-interceptor.interface';
import type {
  AxiosCompatibleRequestConfig,
  AxiosCompatibleRequestOptions,
  AxiosLikeRequestConfig,
  AxiosLikeResponse,
} from './axios-compatible.interface';
import type { AxiosHeaderValue } from './axios-headers';

/**
 * Options accepted as the 3rd argument to `interceptors.<request|response>.use()`,
 * matching axios: `runWhen` skips the interceptor for a given config, and
 * `synchronous` is a hint that the handler never returns a Promise.
 */
export interface AxiosInterceptorOptions {
  synchronous?: boolean;
  runWhen?: (config: AxiosLikeRequestConfig) => boolean;
}

/**
 * Axios-style interceptor manager interface
 */
export interface AxiosInterceptorManager<T> {
  /**
   * Add an interceptor
   * @param onFulfilled Success handler
   * @param onRejected Error handler
   * @param options `runWhen` / `synchronous`, as in axios
   * @returns Interceptor ID for later ejection
   */
  use(
    onFulfilled?: (value: T) => T | Promise<T>,
    onRejected?: (error: any) => any,
    options?: AxiosInterceptorOptions,
  ): number;

  /**
   * Remove an interceptor by ID
   * @param id The interceptor ID returned by use()
   */
  eject(id: number): void;

  /**
   * Clear all interceptors
   */
  clear(): void;
}

type HeaderMap = Record<string, AxiosHeaderValue>;

/**
 * Subset of axios' `instance.defaults` that is honoured at request time.
 * Mutations (e.g. `defaults.headers.common['Authorization'] = token`) apply
 * to every subsequent request made through the HttpService.
 */
export interface AxiosRefDefaults {
  baseURL?: string;
  timeout?: number;
  headers: {
    common: HeaderMap;
    get: HeaderMap;
    delete: HeaderMap;
    head: HeaderMap;
    options: HeaderMap;
    post: HeaderMap;
    put: HeaderMap;
    patch: HeaderMap;
    [header: string]: AxiosHeaderValue | HeaderMap;
  };
}

/**
 * Axios-compatible reference, mirroring the parts of the `AxiosInstance`
 * exposed by `@nestjs/axios`' `httpService.axiosRef` that are commonly used:
 * interceptors, defaults and the promise-based request methods.
 */
export interface AxiosRef {
  interceptors: {
    request: AxiosInterceptorManager<AxiosLikeRequestConfig>;
    response: AxiosInterceptorManager<AxiosLikeResponse>;
  };
  defaults: AxiosRefDefaults;
  request<T = any>(
    config: AxiosCompatibleRequestConfig,
  ): Promise<AxiosLikeResponse<T>>;
  get<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  delete<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  head<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  options<T = any>(
    url: string,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  post<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  put<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
  patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosCompatibleRequestOptions,
  ): Promise<AxiosLikeResponse<T>>;
}

/**
 * Extended HttpService interface with axios compatibility
 */
export interface HttpServiceWithAxiosRef {
  /**
   * Axios-compatible reference for interceptor management
   */
  axiosRef: AxiosRef;
}
