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
  return {
    baseURL: moduleOptions?.baseURL,
    headers: {
      common: {},
      get: {},
      delete: {},
      head: {},
      options: {},
      post: {},
      put: {},
      patch: {},
    },
  };
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
