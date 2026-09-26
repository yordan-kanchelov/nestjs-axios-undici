import {
  brotliDecompressSync,
  createBrotliDecompress,
  createGunzip,
  createInflate,
  gunzipSync,
  inflateRawSync,
  inflateSync,
} from 'node:zlib';
import type { Readable } from 'node:stream';
import type { Dispatcher } from 'undici';
import type { AxiosResponseType } from '../interfaces/axios-compatible.interface';

/** axios: `ERR_BAD_RESPONSE`, `maxContentLength size of ${limit} exceeded` - checked against real axios 1.20 (`lib/adapters/http.js`). */
function assertMaxContentLength(size: number, maxContentLength?: number): void {
  if (maxContentLength && maxContentLength > -1 && size > maxContentLength) {
    const error: any = new Error(
      `maxContentLength size of ${maxContentLength} exceeded`,
    );
    error.code = 'ERR_BAD_RESPONSE';
    throw error;
  }
}

/**
 * Reads a body stream into a `Buffer`, enforcing `maxContentLength` as bytes
 * arrive (axios does the same - see `lib/adapters/http.js`'s streamed
 * `maxContentLength` enforcement) rather than after buffering the whole
 * response: a body that exceeds the limit is rejected, and the underlying
 * stream released (via the `for await` loop's own `return()` call on an
 * abrupt completion), as soon as the limit is crossed - not after reading
 * however much more of a possibly-huge response follows. Only used when a
 * limit is actually set; an unset/`-1` `maxContentLength` (the common case)
 * defers to undici's own `.arrayBuffer()`, unchanged.
 */
async function readBufferWithLimit(
  body: Dispatcher.ResponseData['body'],
  maxContentLength?: number,
): Promise<Buffer> {
  if (!maxContentLength || maxContentLength <= -1) {
    return Buffer.from(await body.arrayBuffer());
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body as unknown as AsyncIterable<Buffer>) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxContentLength) {
      const error: any = new Error(
        `maxContentLength size of ${maxContentLength} exceeded`,
      );
      error.code = 'ERR_BAD_RESPONSE';
      throw error;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// JSON parsing (axios' `transitional.forcedJSONParsing` / `silentJSONParsing`)
// ---------------------------------------------------------------------------

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
 * True when the first non-whitespace character of `text` starts a JSON
 * value (`{`, `[`, a string, a number, or `true`/`false`/`null`). Used to
 * gate the JSON-parse attempt on non-JSON content types, the same
 * optimisation `forcedJSONParsing` needs since it otherwise tries to parse
 * every string response.
 */
function isJsonStart(text: string): boolean {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text.charCodeAt(i);
    // space, tab, CR, LF
    if (c === 0x20 || c === 0x09 || c === 0x0d || c === 0x0a) {
      i++;
      continue;
    }
    break;
  }
  if (i >= n) return false;
  const c = text.charCodeAt(i);
  if (c === 0x7b /* { */ || c === 0x5b /* [ */ || c === 0x22 /* " */) {
    return true;
  }
  if (c === 0x2d /* - */ || (c >= 0x30 && c <= 0x39) /* 0-9 */) return true;
  const rest = text.slice(i, i + 5);
  return (
    rest.startsWith('true') ||
    rest.startsWith('false') ||
    rest.startsWith('null')
  );
}

/**
 * Parses JSON only when the text looks like it starts a JSON value; falls
 * back to the raw string silently otherwise. Avoids a wasted `JSON.parse`
 * try/catch for ordinary text responses.
 */
export function parseTextMaybeJson(text: string): any {
  if (!text || !isJsonStart(text)) return text;
  return parseJsonOrText(text);
}

// ---------------------------------------------------------------------------
// Content-type classification (axios decodes every non-`arraybuffer` /
// non-`stream` response to a UTF-8 string; this narrows that to the content
// types axios projects realistically send as text, so genuine binary
// downloads without an explicit `responseType` still come back as a Buffer)
// ---------------------------------------------------------------------------

const JSON_CONTENT_TYPE_RE = /^application\/(?:[\w!#$%^&*_.-]*\+)?json\b/i;
const TEXT_DECODABLE_RE =
  /^(?:text\/|application\/xml\b|application\/(?:x-)?javascript\b|application\/x-www-form-urlencoded\b|image\/svg\+xml\b|application\/octet-stream\b)/i;

export type BodyContentKind = 'json' | 'text' | 'binary';

/**
 * Classifies a `Content-Type` for the default (no explicit `responseType`)
 * decoding path. Empty/missing content type is treated as text, matching
 * axios (which decodes to a string regardless of content type).
 */
export function classifyContentType(contentType: string): BodyContentKind {
  const ct = contentType.trim();
  if (!ct) return 'text';
  if (JSON_CONTENT_TYPE_RE.test(ct)) return 'json';
  if (TEXT_DECODABLE_RE.test(ct)) return 'text';
  return 'binary';
}

// ---------------------------------------------------------------------------
// Decompression (gzip / br / deflate), honouring `decompress: false`
// ---------------------------------------------------------------------------

const GZIP_ENCODINGS = new Set(['gzip', 'x-gzip']);

/**
 * `Content-Encoding` values `decompressBuffer`/`decompressStream` can
 * actually decode. Used to build the default `Accept-Encoding` request
 * header: unlike axios (which also advertises `compress`, an old LZW scheme
 * neither axios nor this library decodes), this only lists what can be
 * decompressed.
 */
export const SUPPORTED_CONTENT_ENCODINGS = 'gzip, deflate, br';

function normalizeEncoding(encoding: string): string {
  return encoding.trim().toLowerCase();
}

/** Synchronously decompresses a full body buffer per `Content-Encoding`. */
export function decompressBuffer(buffer: Buffer, encoding: string): Buffer {
  const e = normalizeEncoding(encoding);
  if (GZIP_ENCODINGS.has(e)) return gunzipSync(buffer);
  if (e === 'br') return brotliDecompressSync(buffer);
  if (e === 'deflate') {
    try {
      return inflateSync(buffer);
    } catch {
      // Some servers send raw (headerless) deflate under the same
      // Content-Encoding; axios falls back to it the same way.
      return inflateRawSync(buffer);
    }
  }
  return buffer;
}

/** Pipes a response body stream through the matching zlib decompressor. */
export function decompressStream(body: Readable, encoding: string): Readable {
  const e = normalizeEncoding(encoding);
  if (GZIP_ENCODINGS.has(e)) return body.pipe(createGunzip());
  if (e === 'br') return body.pipe(createBrotliDecompress());
  if (e === 'deflate') return body.pipe(createInflate());
  return body;
}

/** True when a `maxContentLength` is actually set (matches `assertMaxContentLength`/`readBufferWithLimit`'s own guard: 0/`undefined`/`-1` all mean "no limit"). */
function hasContentLengthLimit(maxContentLength?: number): boolean {
  return !!maxContentLength && maxContentLength > -1;
}

/**
 * Streams a compressed body through the matching zlib decompressor,
 * enforcing `maxContentLength` on the DECOMPRESSED bytes as they arrive -
 * matching axios 1.20 (`lib/adapters/http.js`'s streamed `maxContentLength`
 * enforcement, applied to the decompression pipeline's own output) - so a
 * small, highly compressible body (a "gzip bomb") can't blow memory up fully
 * decompressing before the limit is ever checked. Both the compressed body
 * stream and the decompression stream are destroyed the moment the limit is
 * crossed (rather than relying only on `for await`'s own `return()` call on
 * an abrupt completion, which unpipes/destroys the decompression stream but
 * never its `.pipe()` source - so the compressed body/socket would otherwise
 * keep flowing until the producer itself notices nobody's reading), with the
 * same `ERR_BAD_RESPONSE` error `readBufferWithLimit` throws for the
 * uncompressed case.
 *
 * Only called when a limit is actually set (see `readBuffer`/`readText`):
 * decompressing a *compressed* body this way measures slower than
 * `decompressBuffer`'s single sync call for a normal, unlimited body, so the
 * common case keeps using that instead.
 */
async function readDecompressedBufferWithLimit(
  body: Readable,
  encoding: string,
  maxContentLength: number,
): Promise<Buffer> {
  const decompressed = decompressStream(body, encoding);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of decompressed) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxContentLength) {
      const error: any = new Error(
        `maxContentLength size of ${maxContentLength} exceeded`,
      );
      error.code = 'ERR_BAD_RESPONSE';
      decompressed.destroy(error);
      body.destroy(error);
      throw error;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

const BOM = 0xfeff;

/** axios' `stripBOM`: drops a leading UTF-8 BOM character. */
function stripBOM(text: string): string {
  return text.charCodeAt(0) === BOM ? text.slice(1) : text;
}

export interface BodyDecodeOptions {
  maxContentLength?: number;
  /** The response's `Content-Encoding` header, when present. */
  contentEncoding?: string;
  /** `false` disables decompression, as in axios. Default: decompress. */
  decompress?: boolean;
}

function shouldDecompress(options: BodyDecodeOptions): boolean {
  return !!options.contentEncoding && options.decompress !== false;
}

async function readBuffer(
  body: Dispatcher.ResponseData['body'],
  options: BodyDecodeOptions,
): Promise<Buffer> {
  // `maxContentLength` applies to the *decoded* bytes, as in axios. When a
  // limit is actually set, the decompression itself is streamed and the
  // limit enforced on the decompressed bytes as they arrive
  // (`readDecompressedBufferWithLimit`), so a gzip bomb can't fully
  // decompress in memory before being rejected. The common, unlimited case
  // keeps buffering the (usually much smaller) compressed body fully first
  // and decompressing it in one synchronous call - measurably faster than
  // streaming through zlib for a normal-sized body.
  if (shouldDecompress(options)) {
    if (hasContentLengthLimit(options.maxContentLength)) {
      return readDecompressedBufferWithLimit(
        body as unknown as Readable,
        options.contentEncoding!,
        options.maxContentLength!,
      );
    }
    return decompressBuffer(
      Buffer.from(await body.arrayBuffer()),
      options.contentEncoding!,
    );
  }
  return readBufferWithLimit(body, options.maxContentLength);
}

/**
 * Reads the body as a UTF-8 string. When nothing needs decompressing or
 * limiting this defers to undici's own `.text()` (which already strips a
 * BOM), so the common, unlimited/uncompressed path costs nothing extra.
 */
export async function readText(
  body: Dispatcher.ResponseData['body'],
  options: BodyDecodeOptions,
): Promise<string> {
  if (shouldDecompress(options)) {
    // Same split as `readBuffer`: stream-and-enforce only when a limit is
    // actually set, otherwise the fast, fully-buffered sync decompress.
    if (hasContentLengthLimit(options.maxContentLength)) {
      const buffer = await readDecompressedBufferWithLimit(
        body as unknown as Readable,
        options.contentEncoding!,
        options.maxContentLength!,
      );
      return stripBOM(buffer.toString('utf8'));
    }
    const buffer = decompressBuffer(
      Buffer.from(await body.arrayBuffer()),
      options.contentEncoding!,
    );
    return stripBOM(buffer.toString('utf8'));
  }
  if (!options.maxContentLength || options.maxContentLength <= -1) {
    return body.text();
  }
  const buffer = await readBufferWithLimit(body, options.maxContentLength);
  return stripBOM(buffer.toString('utf8'));
}

// ---------------------------------------------------------------------------
// Default (no explicit `responseType`) body decoding
// ---------------------------------------------------------------------------

/**
 * Decodes a response body the way axios does when no `responseType` is set:
 * JSON (`application/json` and any `+json` suffix) is always parsed;
 * everything text-decodable (see `classifyContentType`) is decoded to a
 * UTF-8 string and JSON-parsed only when it looks like JSON
 * (`forcedJSONParsing` gated on the first character, `silentJSONParsing` on
 * failure); anything else stays a Buffer.
 */
export async function readDefaultBody(
  body: Dispatcher.ResponseData['body'],
  contentType: string,
  options: BodyDecodeOptions,
): Promise<any> {
  const kind = classifyContentType(contentType);

  if (kind === 'binary') {
    const buffer = await readBuffer(body, options);
    assertMaxContentLength(buffer.byteLength, options.maxContentLength);
    return buffer;
  }

  const text = await readText(body, options);
  if (options.maxContentLength) {
    assertMaxContentLength(Buffer.byteLength(text), options.maxContentLength);
  }
  return kind === 'json' ? parseJsonOrText(text) : parseTextMaybeJson(text);
}

// ---------------------------------------------------------------------------
// Explicit `responseType` body decoding
// ---------------------------------------------------------------------------

/**
 * Reads an undici response body according to an explicit axios
 * `responseType`:
 * - `stream`: the (optionally decompressed) undici body, a Node.js Readable
 * - `arraybuffer`: a Buffer (what axios returns in Node.js)
 * - `blob`/`text`/`document`: a UTF-8 string, never JSON-parsed (what axios
 *   returns for `blob` in Node.js, which has no native Blob decoding there)
 * - `json`: JSON-parsed regardless of Content-Type, raw string if invalid
 */
export async function readBodyAsResponseType(
  body: Dispatcher.ResponseData['body'],
  responseType: AxiosResponseType,
  maxContentLength?: number,
  decodeOptions?: Omit<BodyDecodeOptions, 'maxContentLength'>,
): Promise<any> {
  const options: BodyDecodeOptions = { maxContentLength, ...decodeOptions };

  if (responseType === 'stream') {
    return shouldDecompress(options)
      ? decompressStream(body, options.contentEncoding!)
      : body;
  }

  if (responseType === 'arraybuffer') {
    const buffer = await readBuffer(body, options);
    assertMaxContentLength(buffer.byteLength, maxContentLength);
    return buffer;
  }

  const text = await readText(body, options);
  if (maxContentLength) {
    assertMaxContentLength(Buffer.byteLength(text), maxContentLength);
  }
  return responseType === 'json' ? parseJsonOrText(text) : text;
}
