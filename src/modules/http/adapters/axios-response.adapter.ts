import type { Dispatcher } from 'undici';
import { createStatusError } from '../errors/axios-error';
import {
  parseJsonOrText,
  readBodyAsResponseType,
} from './axios-response-type.adapter';
import type { HttpInterceptorRequest } from '../interfaces/http-interceptor.interface';
import type {
  AxiosLikeResponse,
  AxiosLikeRequestConfig,
} from '../interfaces/axios-compatible.interface';

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
): Promise<AxiosLikeResponse> {
  // Parse the body based on content type
  const contentType = (undiciResponse.headers['content-type'] as string) || '';
  let parsedData: any;

  // Check if maxContentLength is set in options
  const maxContentLength = (request.options as any)?.maxContentLength;
  const responseType = (request.options as any)?.responseType;

  try {
    if (responseType && undiciResponse.body) {
      parsedData = await readBodyAsResponseType(
        undiciResponse.body,
        responseType,
        maxContentLength,
      );
    } else if (undiciResponse.body) {
      if (contentType.includes('application/json')) {
        const text = await undiciResponse.body.text();

        // Check content length
        if (maxContentLength && Buffer.byteLength(text) > maxContentLength) {
          const error: any = new Error(
            `maxContentLength size of ${maxContentLength} exceeded`,
          );
          error.code = 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED';
          throw error;
        }

        parsedData = parseJsonOrText(text);
      } else if (
        contentType.includes('text/') ||
        contentType.includes('application/xml')
      ) {
        parsedData = await undiciResponse.body.text();

        // Check content length
        if (
          maxContentLength &&
          Buffer.byteLength(parsedData) > maxContentLength
        ) {
          const error: any = new Error(
            `maxContentLength size of ${maxContentLength} exceeded`,
          );
          error.code = 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED';
          throw error;
        }
      } else if (
        (undiciResponse.statusCode === 204 ||
          undiciResponse.statusCode === 304) &&
        !contentType
      ) {
        // No Content or Not Modified without content-type should return empty string
        try {
          const text = await undiciResponse.body.text();
          parsedData = text || '';
        } catch {
          parsedData = '';
        }
      } else {
        // For binary data, convert to Buffer
        const arrayBuffer = await undiciResponse.body.arrayBuffer();

        // Check content length
        if (maxContentLength && arrayBuffer.byteLength > maxContentLength) {
          const error: any = new Error(
            `maxContentLength size of ${maxContentLength} exceeded`,
          );
          error.code = 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED';
          throw error;
        }

        parsedData = arrayBuffer.byteLength ? Buffer.from(arrayBuffer) : '';
      }
    } else {
      // Axios returns empty string for null body
      parsedData = '';
    }
  } catch (error) {
    // If it's a size limit error, re-throw it
    if ((error as any)?.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED') {
      throw error;
    }

    // If parsing fails, try to get raw text
    try {
      parsedData = await undiciResponse.body.text();
    } catch {
      parsedData = '';
    }
  }

  // Create Axios-compatible request config from original request
  const config: AxiosLikeRequestConfig = {
    url: typeof request.url === 'string' ? request.url : request.url.toString(),
    method: request.options.method || 'GET',
    headers: request.options.headers as Record<string, string | string[]>,
    timeout: request.options.headersTimeout || request.options.bodyTimeout,
    validateStatus: request.options.validateStatus,
  };

  // Transform to Axios-compatible response
  const axiosLikeResponse: AxiosLikeResponse = {
    data: parsedData,
    status: undiciResponse.statusCode,
    statusText: STATUS_TEXT_MAP[undiciResponse.statusCode] || 'Unknown',
    headers: undiciResponse.headers as Record<string, string | string[]>,
    config,
  };

  // Axios throws errors for 4xx and 5xx status codes by default
  // Unless validateStatus says otherwise
  // Note: Axios also treats 3xx codes as errors by default
  const validateStatus =
    config.validateStatus ||
    ((status: number) => {
      // Default axios behavior: only 2xx are valid
      return status >= 200 && status < 300;
    });
  const isValidStatus = validateStatus(undiciResponse.statusCode);

  if (!isValidStatus) {
    throw createStatusError(axiosLikeResponse, config);
  }

  return axiosLikeResponse;
}
