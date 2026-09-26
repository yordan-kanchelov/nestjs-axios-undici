import type { UrlObject } from 'node:url';
import type { Dispatcher } from 'undici';
import { AxiosError, createStatusError } from '../errors/axios-error';
import {
  readBodyAsResponseType,
  readDefaultBody,
  readText,
} from './axios-response-type.adapter';
import { buildLazyAxiosConfig } from './axios-request.adapter';
import type { HttpInterceptorRequest } from '../interfaces/http-interceptor.interface';
import type {
  AxiosLikeResponse,
  InternalAxiosLikeRequestConfig,
} from '../interfaces/axios-compatible.interface';

/**
 * A lightweight stand-in for axios' `response.request`/`error.request` (the
 * real `http.ClientRequest`, wrapped by `follow-redirects`): axios' own,
 * commonly-read fields (`path`, `method`, `host`, `protocol`, and
 * `res.responseUrl` - the final hop's URL, set whether or not a redirect was
 * actually followed) built from whatever this library already resolved for
 * the hop that was actually dispatched, at no cost beyond a handful of
 * property reads (a `new URL()` parse only for a string URL, cheap relative
 * to the network I/O and body decoding this runs alongside). Built once per
 * response/error - never per byte, and never at all on a code path that
 * doesn't reach a response or a network/timeout error (see `toAxiosError`).
 */
export function buildRequestInfo(
  url: string | URL | UrlObject,
  method: string,
  responseUrl?: string,
): Record<string, any> {
  let protocol: string | undefined;
  let host: string | undefined;
  let path: string | undefined;
  if (url instanceof URL) {
    protocol = url.protocol;
    host = url.hostname;
    path = `${url.pathname}${url.search}`;
  } else if (typeof url === 'string') {
    try {
      const parsed = new URL(url);
      protocol = parsed.protocol;
      host = parsed.hostname;
      path = `${parsed.pathname}${parsed.search}`;
    } catch {
      // Leave path/host/protocol undefined - same as axios itself would
      // give for a request that never got far enough to resolve one.
    }
  } else if (url && typeof url === 'object') {
    protocol = (url as UrlObject).protocol ?? undefined;
    host = (url as UrlObject).hostname ?? undefined;
    path = `${(url as UrlObject).pathname ?? ''}${(url as UrlObject).search ?? ''}`;
  }
  const info: Record<string, any> = { method, path, host, protocol };
  if (responseUrl !== undefined) info.res = { responseUrl };
  return info;
}

/**
 * `AxiosLikeResponse` with `config` built lazily, from a `config` getter on
 * the prototype (defined once) rather than a `Object.defineProperty` call
 * per instance - the getter itself costs nothing until `.config` is read,
 * unlike installing a per-instance accessor on every response.
 */
class AxiosLikeResponseImpl<T = any> implements AxiosLikeResponse<T> {
  // `config` is a plain own property, as in axios, so it survives
  // `{ ...response }`, `JSON.stringify` and `structuredClone`.
  public config: InternalAxiosLikeRequestConfig;
  public request: any;
  public data: T;
  public status: number;
  public statusText: string;

  /**
   * A plain undici headers object, deliberately *not* wrapped in
   * `AxiosHeaders` on every response (plan.md phase 2 "types: axios
   * interop", goal 3: "measure it; if it costs more than the benchmark
   * threshold allows, keep a plain object at runtime but type it
   * compatibly"). Measured (`new AxiosHeaders(typicalHeaders)` vs a plain
   * object, 200k iterations, this sandbox): about 955ns more per response
   * just to construct the Proxy-wrapped instance (~1µs vs ~33ns), before
   * counting that every later property read on it also pays a Proxy-trap
   * cost the plain object doesn't (see the "avoid AxiosHeaders Proxy access
   * on the hot path" note in plan.md phase 4, and PR #18's ~9µs/request fix
   * for exactly that on the interceptor path). That's paid on *every*
   * response unconditionally, unlike `config` (lazy, built only if read),
   * and would eat a large slice of the +10% per-request CPU budget the
   * "HttpService regression check" enforces - not worth it for a header
   * bag most callers only ever index by string key. Typed compatibly with
   * axios' `AxiosResponse.headers` regardless (`Record<string, any>`, see
   * `AxiosLikeResponse`'s doc comment) - `response.headers.get(...)` etc.
   * stay unavailable, documented in docs/axios-supported-options.md.
   */
  public headers: Record<string, any>;

  constructor(
    data: T,
    status: number,
    statusText: string,
    headers: any,
    configRequest: HttpInterceptorRequest,
    requestInfo: Record<string, any>,
  ) {
    this.data = data;
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.config = buildLazyAxiosConfig(configRequest);
    this.request = requestInfo;
  }
}

/**
 * HTTP status text mapping
 */
export const STATUS_TEXT_MAP: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

/**
 * Converts an undici response to the axios-compatible response format,
 * reading and parsing the body and rejecting with an axios-like error when
 * the status fails `validateStatus`. HttpService applies it at the end of the
 * interceptor chain; AxiosResponseAdapterInterceptor exposes it as an
 * interceptor.
 */
export async function toAxiosLikeResponse(
  request: HttpInterceptorRequest,
  undiciResponse: Dispatcher.ResponseData,
  // Built by `HttpService.executeRequest` from the hop that was actually
  // dispatched (see `buildRequestInfo`), whether or not a redirect was
  // followed, matching axios. Callers with no such hop tracking of their
  // own (e.g. the standalone `AxiosResponseAdapterInterceptor`) can omit it;
  // a reasonable one is then built from `request` itself.
  requestInfo?: Record<string, any>,
): Promise<AxiosLikeResponse> {
  requestInfo ??= buildRequestInfo(
    request.url,
    String((request.options as any)?.method || 'GET'),
  );
  // Parse the body based on content type
  const contentType = (undiciResponse.headers['content-type'] as string) || '';
  let parsedData: any;

  // Check if maxContentLength is set in options
  const maxContentLength = (request.options as any)?.maxContentLength;
  const responseType = (request.options as any)?.responseType;
  const decompress = (request.options as any)?.decompress;
  const contentEncodingHeader = undiciResponse.headers['content-encoding'];
  const contentEncoding = Array.isArray(contentEncodingHeader)
    ? contentEncodingHeader[0]
    : contentEncodingHeader;
  // A custom `transformResponse` (module- or request-level, only ever set
  // when the axiosRef pipeline built this request - see `hasAxiosPipeline`)
  // *replaces* default parsing, same as axios: it gets the raw decoded body
  // (decompressed, not yet JSON-parsed), not the already-parsed value.
  const transformResponse = request.axiosConfig?.transformResponse;

  try {
    if (transformResponse && responseType !== 'stream') {
      // As in axios: a stream is never transformed, and binary response
      // types hand the transform the raw bytes rather than decoded text.
      const raw = !undiciResponse.body
        ? ''
        : responseType === 'arraybuffer' || responseType === 'blob'
          ? await readBodyAsResponseType(
              undiciResponse.body,
              responseType,
              maxContentLength,
              { contentEncoding, decompress },
            )
          : await readText(undiciResponse.body, {
              contentEncoding,
              decompress,
            });
      const transforms = Array.isArray(transformResponse)
        ? transformResponse
        : [transformResponse];
      parsedData = transforms.reduce(
        (value: any, fn: any) =>
          fn.call(
            request.axiosConfig,
            value,
            undiciResponse.headers,
            undiciResponse.statusCode,
          ),
        raw,
      );
    } else if (responseType && undiciResponse.body) {
      parsedData = await readBodyAsResponseType(
        undiciResponse.body,
        responseType,
        maxContentLength,
        { contentEncoding, decompress },
      );
    } else if (undiciResponse.body) {
      parsedData = await readDefaultBody(undiciResponse.body, contentType, {
        maxContentLength,
        contentEncoding,
        decompress,
      });
    } else {
      // Axios returns empty string for null body
      parsedData = '';
    }
  } catch (error) {
    // `maxContentLength` exceeded: a well-formed AxiosError (`name` stays
    // `'AxiosError'`, not the plain internal `Error`'s own `'Error'`), not
    // the plain, internal `Error` `assertMaxContentLength` throws to keep
    // the hot, no-limit path free of any AxiosError construction cost.
    if ((error as any)?.code === 'ERR_BAD_RESPONSE') {
      const axiosError = new AxiosError(
        (error as Error).message,
        AxiosError.ERR_BAD_RESPONSE,
        undefined,
        requestInfo,
      );
      axiosError._setLazyConfig(request);
      throw axiosError;
    }
    // Failures after the body was read (for example corrupt gzip/br/deflate
    // data), reject like axios does: the body can't be read again, so
    // falling back would silently return empty data.
    if ((undiciResponse.body as any)?.bodyUsed) {
      throw error;
    }

    // If parsing fails, try to get raw text
    try {
      parsedData = await undiciResponse.body.text();
    } catch {
      parsedData = '';
    }
  }

  // Transform to Axios-compatible response. `config` is built lazily (see
  // `AxiosLikeResponseImpl`): `request.axiosConfig` already holds the final,
  // interceptor-mutated config when the axiosRef pipeline built this
  // request, and is otherwise built - correctly shaped, but only if/when
  // read - from the cheap fields `normalizeAxiosRequest` computed.
  const axiosLikeResponse = new AxiosLikeResponseImpl(
    parsedData,
    undiciResponse.statusCode,
    // undici exposes the server's actual reason phrase (matching axios, which
    // reads Node's `res.statusMessage`); the table is only a fallback for a
    // dispatcher that doesn't provide one (e.g. HTTP/2, which has none).
    undiciResponse.statusText ||
      STATUS_TEXT_MAP[undiciResponse.statusCode] ||
      'Unknown',
    undiciResponse.headers as Record<string, string | string[]>,
    request,
    requestInfo,
  );

  // Axios throws errors for 4xx and 5xx status codes by default, unless
  // `validateStatus` says otherwise. `validateStatus: null` (or `undefined`
  // set as an explicit own key - see `normalizeAxiosRequest`) means every
  // status resolves, as in axios' `settle()` (`!validateStatus ||
  // validateStatus(status)`): only a *function* ever narrows this.
  const configuredValidateStatus = (request.options as any)?.validateStatus;
  const isValidStatus =
    typeof configuredValidateStatus === 'function'
      ? configuredValidateStatus(undiciResponse.statusCode)
      : Object.prototype.hasOwnProperty.call(
            request.options as any,
            'validateStatus',
          )
        ? true
        : undiciResponse.statusCode >= 200 && undiciResponse.statusCode < 300;

  if (!isValidStatus) {
    throw createStatusError(axiosLikeResponse, request);
  }

  return axiosLikeResponse;
}
