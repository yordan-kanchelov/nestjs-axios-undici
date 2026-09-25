import type { HttpInterceptorRequest } from '../interfaces/http-interceptor.interface';
import type {
  AxiosLikeRequestConfig,
  AxiosLikeResponse,
} from '../interfaces/axios-compatible.interface';

/**
 * Axios-compatible error class.
 *
 * Mirrors the shape of axios' `AxiosError` (`message`, `code`, `config`,
 * `request`, `response`, `status`, `isAxiosError`, `toJSON()`), so code that
 * duck-types errors (including `axios.isAxiosError(error)`, which only checks
 * `error.isAxiosError === true`) keeps working after migrating from
 * `@nestjs/axios`.
 *
 * Note: `error instanceof AxiosError` is only true for this class, not for the
 * class exported by the `axios` package itself.
 */
export class AxiosError<T = any> extends Error {
  static readonly ERR_BAD_OPTION_VALUE = 'ERR_BAD_OPTION_VALUE';
  static readonly ERR_BAD_OPTION = 'ERR_BAD_OPTION';
  static readonly ECONNABORTED = 'ECONNABORTED';
  static readonly ETIMEDOUT = 'ETIMEDOUT';
  static readonly ECONNREFUSED = 'ECONNREFUSED';
  static readonly ERR_NETWORK = 'ERR_NETWORK';
  static readonly ERR_FR_TOO_MANY_REDIRECTS = 'ERR_FR_TOO_MANY_REDIRECTS';
  static readonly ERR_DEPRECATED = 'ERR_DEPRECATED';
  static readonly ERR_BAD_RESPONSE = 'ERR_BAD_RESPONSE';
  static readonly ERR_BAD_REQUEST = 'ERR_BAD_REQUEST';
  static readonly ERR_CANCELED = 'ERR_CANCELED';
  static readonly ERR_NOT_SUPPORT = 'ERR_NOT_SUPPORT';
  static readonly ERR_INVALID_URL = 'ERR_INVALID_URL';

  public readonly isAxiosError = true;
  public code?: string;
  public config?: AxiosLikeRequestConfig;
  public request?: any;
  public response?: AxiosLikeResponse<T>;
  public status?: number;
  public override cause?: unknown;

  constructor(
    message?: string,
    code?: string,
    config?: AxiosLikeRequestConfig,
    request?: any,
    response?: AxiosLikeResponse<T>,
  ) {
    super(message);
    this.name = 'AxiosError';
    if (code) this.code = code;
    if (config) this.config = config;
    if (request) this.request = request;
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }

  /**
   * Wraps an arbitrary error into an AxiosError, keeping the original error
   * available as the (non-enumerable) `cause`.
   */
  static from<T = any>(
    error: any,
    code?: string,
    config?: AxiosLikeRequestConfig,
    request?: any,
    response?: AxiosLikeResponse<T>,
  ): AxiosError<T> {
    const axiosError = new AxiosError<T>(
      error?.message ?? String(error),
      code ?? (typeof error?.code === 'string' ? error.code : undefined),
      config,
      request,
      response,
    );
    Object.defineProperty(axiosError, 'cause', {
      value: error,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    if (error?.name) {
      axiosError.name = error.name;
    }
    return axiosError;
  }

  toJSON(): Record<string, unknown> {
    return {
      message: this.message,
      name: this.name,
      stack: this.stack,
      config: this.config,
      code: this.code,
      status: this.status,
    };
  }
}

/**
 * Error raised when a request is cancelled through an `AbortSignal` or an
 * axios `CancelToken`. Mirrors axios' `CanceledError` (`code: 'ERR_CANCELED'`,
 * `__CANCEL__: true`), so `axios.isCancel(error)` keeps working.
 */
export class CanceledError<T = any> extends AxiosError<T> {
  public readonly __CANCEL__ = true;

  constructor(message?: string | null, config?: AxiosLikeRequestConfig, request?: any) {
    super(message == null ? 'canceled' : message, AxiosError.ERR_CANCELED, config, request);
    this.name = 'CanceledError';
  }
}

/**
 * Same contract as `axios.isAxiosError()`.
 */
export function isAxiosError<T = any>(payload: unknown): payload is AxiosError<T> {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    (payload as { isAxiosError?: unknown }).isAxiosError === true
  );
}

/**
 * Same contract as `axios.isCancel()`.
 */
export function isCancel(value: unknown): value is CanceledError {
  return !!(value && (value as { __CANCEL__?: unknown }).__CANCEL__);
}

const TIMEOUT_CODES = new Set([
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Builds the axios-like `config` object attached to errors and responses.
 */
export function buildAxiosErrorConfig(
  request: HttpInterceptorRequest,
): AxiosLikeRequestConfig {
  const options: any = request.options || {};
  return {
    url: typeof request.url === 'string' ? request.url : String(request.url),
    method: options.method || 'GET',
    headers: options.headers,
    timeout: options.headersTimeout || options.bodyTimeout,
    validateStatus: options.validateStatus,
  };
}

/**
 * Creates the error axios throws when `validateStatus` rejects a response.
 */
export function createStatusError<T = any>(
  response: AxiosLikeResponse<T>,
  request?: any,
): AxiosError<T> {
  return new AxiosError<T>(
    `Request failed with status code ${response.status}`,
    response.status >= 400 && response.status < 500
      ? AxiosError.ERR_BAD_REQUEST
      : AxiosError.ERR_BAD_RESPONSE,
    response.config,
    request,
    response,
  );
}

/**
 * Converts an error raised by undici (network failure, timeout, abort, ...)
 * into an axios-compatible error with the same `code` axios would use.
 * Errors that are already axios errors are returned unchanged.
 */
export function toAxiosError(
  error: any,
  request: HttpInterceptorRequest,
): any {
  if (isAxiosError(error)) {
    return error;
  }

  const config = buildAxiosErrorConfig(request);
  const signal: AbortSignal | undefined = (request.options as any)?.signal;

  // Cancellation (AbortController / CancelToken)
  if (
    isCancel(error) ||
    error?.name === 'AbortError' ||
    error?.code === 'UND_ERR_ABORTED' ||
    (signal?.aborted && error === signal.reason)
  ) {
    const message = isCancel(error) ? error.message : undefined;
    const canceled = new CanceledError(message, config);
    Object.defineProperty(canceled, 'cause', {
      value: error,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return canceled;
  }

  if (error && TIMEOUT_CODES.has(error.code)) {
    const timeoutError = AxiosError.from(error, AxiosError.ECONNABORTED, config);
    timeoutError.name = 'AxiosError';
    timeoutError.message = config.timeout
      ? `timeout of ${config.timeout}ms exceeded`
      : 'timeout exceeded';
    return timeoutError;
  }

  if (error && typeof error === 'object' && typeof error.code === 'string') {
    // Node network errors (ECONNREFUSED, ENOTFOUND, ECONNRESET, ...) and undici
    // errors keep their code like in axios; undici socket errors map to the
    // closest axios code.
    const code = error.code === 'UND_ERR_SOCKET' ? 'ECONNRESET' : error.code;
    return AxiosError.from(error, code, config);
  }

  // Anything else (e.g. errors thrown by user interceptors) passes through
  return error;
}
