import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import type {
  HttpInterceptorFunction,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
} from '../interfaces/http-interceptor.interface';
import type {
  AxiosLikeRequestConfig,
  AxiosLikeResponse,
} from '../interfaces/axios-compatible.interface';
import type { AxiosInterceptorManager } from '../interfaces/axios-ref.interface';
import { AxiosHeaders } from '../interfaces/axios-headers';
import { buildURL, serializeRequestData } from './axios-request.adapter';

/**
 * Stored interceptor with metadata
 */
interface StoredInterceptor<T> {
  id: number;
  onFulfilled?: (value: T) => T | Promise<T>;
  onRejected?: (error: any) => any;
}

/**
 * Converts axios request config to undici interceptor request.
 * Options that have no axios-config counterpart (dispatcher, signal,
 * maxContentLength, ...) are carried over from `baseOptions`.
 */
function axiosConfigToInterceptorRequest(
  config: AxiosLikeRequestConfig,
  baseOptions: Record<string, any> = {},
): HttpInterceptorRequest {
  const { url, method, headers, data, timeout, params } = config;

  // Normalize headers to plain object
  const normalizedHeaders: Record<string, string | string[]> = {};
  if (headers) {
    if (headers instanceof AxiosHeaders) {
      // AxiosHeaders instance
      headers.forEach((value, key) => {
        if (value !== null && value !== undefined) {
          normalizedHeaders[key] = String(value);
        }
      });
    } else if (
      typeof (headers as any).set === 'function' &&
      typeof (headers as any).entries === 'function'
    ) {
      // Headers API object
      for (const [key, value] of (headers as any).entries()) {
        normalizedHeaders[key] = value;
      }
    } else if (headers && typeof headers === 'object') {
      // Plain object or record
      Object.entries(headers).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          normalizedHeaders[key] = String(value);
        }
      });
    }
  }

  const { body: baseBody, ...restBaseOptions } = baseOptions;
  const options: any = {
    ...restBaseOptions,
    method: (method || 'GET').toUpperCase(),
    headers: normalizedHeaders,
  };

  // Handle body
  if (data !== undefined && data === baseBody) {
    // Untouched by the interceptor: keep the already serialised body
    options.body = baseBody;
  } else if (data !== undefined) {
    if (typeof data === 'string' || data instanceof Buffer) {
      options.body = data;
    } else {
      options.body = serializeRequestData(data, options.headers, options.method);
    }
  }

  // Handle timeout
  if (timeout !== undefined) {
    options.headersTimeout = timeout;
    options.bodyTimeout = timeout;
  }

  // Map other axios options to undici
  if (config.maxRedirects !== undefined) {
    options.maxRedirections = config.maxRedirects;
  }
  if (config.validateStatus !== undefined) {
    options.validateStatus = config.validateStatus;
  }
  if (config.responseType !== undefined) {
    options.responseType = config.responseType;
  }

  return {
    url: params ? buildURL(String(url || ''), params) : url || '',
    options,
  };
}

/**
 * Converts interceptor request back to axios config
 */
function interceptorRequestToAxiosConfig(
  request: HttpInterceptorRequest,
): AxiosLikeRequestConfig {
  const { url, options } = request;

  // Convert headers to AxiosHeaders for better compatibility
  const axiosHeaders = new AxiosHeaders();
  if (options.headers && typeof options.headers === 'object') {
    Object.entries(options.headers).forEach(([key, value]) => {
      axiosHeaders.set(key, value as string | string[]);
    });
  }

  return {
    url: typeof url === 'string' ? url : url.toString(),
    method: options.method,
    headers: axiosHeaders,
    data: options.body,
    timeout: options.headersTimeout || options.bodyTimeout,
    maxRedirects: options.maxRedirections,
    validateStatus: (options as any).validateStatus,
    responseType: (options as any).responseType,
  };
}

/**
 * Creates an axios-style request interceptor manager
 */
export function createAxiosRequestInterceptorManager(
  addInterceptor: (interceptor: HttpInterceptorFunction) => void,
): AxiosInterceptorManager<AxiosLikeRequestConfig> {
  const interceptors: Map<
    number,
    StoredInterceptor<AxiosLikeRequestConfig>
  > = new Map();
  let nextId = 0;

  return {
    use(
      onFulfilled?: (
        value: AxiosLikeRequestConfig,
      ) => AxiosLikeRequestConfig | Promise<AxiosLikeRequestConfig>,
      onRejected?: (error: any) => any,
    ): number {
      const id = nextId++;
      const interceptor: StoredInterceptor<AxiosLikeRequestConfig> = {
        id,
        onFulfilled,
        onRejected,
      };
      interceptors.set(id, interceptor);

      // Create undici interceptor
      const undiciInterceptor: HttpInterceptorFunction = (request, next) => {
        // Ejected/cleared interceptors become a pass-through
        if (!interceptors.has(id)) {
          return next.handle(request);
        }

        // Convert request to axios config
        const axiosConfig = interceptorRequestToAxiosConfig(request);

        // Apply axios interceptor
        const applyInterceptor = from(
          Promise.resolve(axiosConfig)
            .then(config => (onFulfilled ? onFulfilled(config) : config))
            .catch(error => {
              if (onRejected) {
                return onRejected(error);
              }
              throw error;
            }),
        );

        return applyInterceptor.pipe(
          mergeMap(modifiedConfig => {
            // Convert back to interceptor request
            const modifiedRequest = axiosConfigToInterceptorRequest(
              modifiedConfig,
              request.options,
            );
            return next.handle(modifiedRequest);
          }),
          catchError(error => {
            if (onRejected) {
              return from(Promise.resolve(onRejected(error)));
            }
            return throwError(() => error);
          }),
        );
      };

      addInterceptor(undiciInterceptor);
      return id;
    },

    eject(id: number): void {
      interceptors.delete(id);
    },

    clear(): void {
      interceptors.clear();
    },
  };
}

/**
 * Creates an axios-style response interceptor manager
 */
export function createAxiosResponseInterceptorManager(
  addInterceptor: (interceptor: HttpInterceptorFunction) => void,
): AxiosInterceptorManager<AxiosLikeResponse> {
  const interceptors: Map<
    number,
    StoredInterceptor<AxiosLikeResponse>
  > = new Map();
  let nextId = 0;

  return {
    use(
      onFulfilled?: (
        value: AxiosLikeResponse,
      ) => AxiosLikeResponse | Promise<AxiosLikeResponse>,
      onRejected?: (error: any) => any,
    ): number {
      const id = nextId++;
      const interceptor: StoredInterceptor<AxiosLikeResponse> = {
        id,
        onFulfilled,
        onRejected,
      };
      interceptors.set(id, interceptor);

      // Create undici interceptor
      const undiciInterceptor: HttpInterceptorFunction = (request, next) => {
        // Ejected/cleared interceptors become a pass-through
        if (!interceptors.has(id)) {
          return next.handle(request);
        }

        return next.handle(request).pipe(
          mergeMap(response => {
            if (
              onFulfilled &&
              response &&
              typeof response === 'object' &&
              'data' in response
            ) {
              // It's already an axios-like response
              return from(
                Promise.resolve(onFulfilled(response as AxiosLikeResponse)),
              );
            }
            return of(response);
          }),
          catchError(error => {
            if (onRejected) {
              // Check if it's an axios-like error
              if (error && error.isAxiosError) {
                return from(Promise.resolve(onRejected(error)));
              }
              // Convert to axios-like error if it has response
              if (error && error.response) {
                return from(Promise.resolve(onRejected(error)));
              }
              // Create axios-like error
              const axiosError = {
                ...error,
                response: error.response || null,
                request: error.request || null,
                config: error.config || null,
                isAxiosError: true,
              };
              return from(Promise.resolve(onRejected(axiosError)));
            }
            return throwError(() => error);
          }),
        );
      };

      addInterceptor(undiciInterceptor);
      return id;
    },

    eject(id: number): void {
      interceptors.delete(id);
    },

    clear(): void {
      interceptors.clear();
    },
  };
}
