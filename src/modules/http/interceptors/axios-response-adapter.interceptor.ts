import { Injectable } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { toAxiosError } from '../errors/axios-error';
import { toAxiosLikeResponse } from '../adapters/axios-response.adapter';
import type { Dispatcher } from 'undici';
import type {
  HttpInterceptor,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
  HttpInterceptorFunction,
} from '../interfaces/http-interceptor.interface';
import type { AxiosLikeResponse } from '../interfaces/axios-compatible.interface';

export { STATUS_TEXT_MAP } from '../adapters/axios-response.adapter';

/**
 * Interceptor that transforms Undici responses to Axios-compatible format
 * This allows existing Axios code to work with minimal changes
 */
@Injectable()
export class AxiosResponseAdapterInterceptor implements HttpInterceptor {
  intercept(
    request: HttpInterceptorRequest,
    next: HttpInterceptorHandler,
  ): Observable<any> {
    return next.handle(request).pipe(
      mergeMap(
        async (response: Dispatcher.ResponseData | AxiosLikeResponse) => {
          // Check if it's already an axios-like response (from another interceptor)
          if (
            response &&
            typeof response === 'object' &&
            'data' in response &&
            'status' in response
          ) {
            return response as AxiosLikeResponse;
          }
          return toAxiosLikeResponse(
            request,
            response as Dispatcher.ResponseData,
          );
        },
      ),
      catchError(error => throwError(() => toAxiosError(error, request))),
    );
  }
}

/**
 * Function-based axios response adapter interceptor
 * Can be used directly without dependency injection
 */
export const axiosResponseAdapter: HttpInterceptorFunction = (
  request,
  next,
) => {
  const interceptor = new AxiosResponseAdapterInterceptor();
  return interceptor.intercept(request, next);
};
