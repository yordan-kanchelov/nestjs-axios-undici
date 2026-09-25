import type {
  AxiosLikeRequestConfig,
  AxiosLikeResponse,
  InternalAxiosLikeRequestConfig,
} from './axios-compatible.interface';
import type { AxiosHeaderValue } from './axios-headers';

/**
 * Options accepted as the 3rd argument to `interceptors.<request|response>.use()`,
 * matching axios: `runWhen` skips the interceptor for a given config, and
 * `synchronous` is a hint that the handler never returns a Promise.
 */
export interface AxiosInterceptorOptions {
  synchronous?: boolean;
  runWhen?: (config: InternalAxiosLikeRequestConfig) => boolean;
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
    onFulfilled?: ((value: T) => T | Promise<T>) | null,
    onRejected?: ((error: any) => any) | null,
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
  maxRedirects?: number;
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
 *
 * Not a full `AxiosInstance` yet (not callable, missing `getUri`/`create`/
 * `*Form`/`query`) - plan.md phase 2 "feat(axiosRef): make it a real axios
 * instance".
 */
export interface AxiosRef {
  interceptors: {
    request: AxiosInterceptorManager<InternalAxiosLikeRequestConfig>;
    response: AxiosInterceptorManager<AxiosLikeResponse>;
  };
  defaults: AxiosRefDefaults;
  request<T = any, D = any>(
    config: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  get<T = any, D = any>(
    url: string,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  delete<T = any, D = any>(
    url: string,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  head<T = any, D = any>(
    url: string,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  options<T = any, D = any>(
    url: string,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  post<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  put<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
  patch<T = any, D = any>(
    url: string,
    data?: D,
    config?: AxiosLikeRequestConfig<D>,
  ): Promise<AxiosLikeResponse<T, D>>;
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
