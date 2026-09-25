import type { Observable } from 'rxjs';
import type { Dispatcher } from 'undici';
import type { UndiciURLType, UndiciRequestOptionsType } from '../types';
import type { AxiosLikeRequestConfig } from './axios-compatible.interface';

export interface HttpInterceptorRequest {
  url: UndiciURLType;
  options: UndiciRequestOptionsType;
  /**
   * The axios-shaped config this request was built from, when one is
   * available: eagerly, once axiosRef request interceptors have run, or
   * lazily otherwise (a getter, materialised on first access so a plain
   * request that nobody inspects `response.config`/`error.config` for never
   * pays to build it). `response.config` and `error.config` read this.
   */
  axiosConfig?: AxiosLikeRequestConfig;
}

export interface HttpInterceptor {
  intercept(
    request: HttpInterceptorRequest,
    next: HttpInterceptorHandler,
  ): Observable<any>;
}

export interface HttpInterceptorHandler {
  handle(request: HttpInterceptorRequest): Observable<any>;
}

export type HttpInterceptorFunction = (
  request: HttpInterceptorRequest,
  next: HttpInterceptorHandler,
) => Observable<any>;
