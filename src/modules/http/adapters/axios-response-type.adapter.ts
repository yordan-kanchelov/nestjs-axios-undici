import type { Dispatcher } from 'undici';
import type { AxiosResponseType } from '../interfaces/axios-compatible.interface';

function assertMaxContentLength(size: number, maxContentLength?: number): void {
  if (maxContentLength && maxContentLength > -1 && size > maxContentLength) {
    const error: any = new Error(`maxContentLength size of ${maxContentLength} exceeded`);
    error.code = 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED';
    throw error;
  }
}

/**
 * Parses JSON like axios' default `transformResponse` with
 * `silentJSONParsing: true`: invalid JSON yields the raw string instead of
 * throwing.
 */
export function parseJsonOrText(text: string): any {
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Reads an undici response body according to an explicit axios
 * `responseType`:
 * - `stream`: the undici body (a Node.js Readable), unconsumed
 * - `arraybuffer` / `blob`: a Buffer (what axios returns in Node.js)
 * - `text` / `document`: a string, never JSON-parsed
 * - `json`: JSON-parsed regardless of Content-Type, raw string if invalid
 */
export async function readBodyAsResponseType(
  body: Dispatcher.ResponseData['body'],
  responseType: AxiosResponseType,
  maxContentLength?: number,
): Promise<any> {
  if (responseType === 'stream') {
    return body;
  }

  if (responseType === 'arraybuffer' || responseType === 'blob') {
    const buffer = Buffer.from(await body.arrayBuffer());
    assertMaxContentLength(buffer.byteLength, maxContentLength);
    return buffer;
  }

  const text = await body.text();
  assertMaxContentLength(Buffer.byteLength(text), maxContentLength);
  return responseType === 'json' ? parseJsonOrText(text) : text;
}
