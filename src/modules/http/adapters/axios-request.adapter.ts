import { PassThrough, Readable } from 'stream';
import type { UrlObject } from 'node:url';
import type {
  AxiosCancelTokenLike,
  AxiosParamsSerializer,
} from '../interfaces/axios-compatible.interface';
import type { AxiosRefDefaults } from '../interfaces/axios-ref.interface';

/**
 * Per-service context used when normalising a request.
 */
export interface AxiosRequestContext {
  /** Live `httpService.axiosRef.defaults` object */
  defaults?: AxiosRefDefaults;
  /** Module-level (register/registerAsync) request options */
  instanceOptions?: Record<string, any>;
}

type Url = string | URL | UrlObject;

type HeaderRecord = Record<string, any>;

const FORM_URLENCODED = 'application/x-www-form-urlencoded';

/**
 * Keys understood by this adapter that must not be forwarded to undici.
 */
const AXIOS_ONLY_KEYS = [
  'url',
  'baseURL',
  'params',
  'paramsSerializer',
  'data',
  'auth',
  'cancelToken',
  'maxRedirects',
] as const;

// ---------------------------------------------------------------------------
// URL helpers (ported from axios/lib/helpers so the resulting URLs match)
// ---------------------------------------------------------------------------

/**
 * Same as axios' `isAbsoluteURL`: `<scheme>://` or protocol-relative `//`.
 */
export function isAbsoluteURL(url: string): boolean {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
}

/**
 * Same as axios' `combineURLs`: plain string concatenation, so a path on the
 * baseURL is preserved (`http://api/v1` + `/users` => `http://api/v1/users`).
 */
export function combineURLs(baseURL: string, relativeURL: string): string {
  return relativeURL
    ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '')
    : baseURL;
}

/**
 * axios' default query value encoder.
 */
function encodeParam(value: string): string {
  return encodeURIComponent(value)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+');
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isVisitable(value: unknown): boolean {
  return isPlainObject(value) || Array.isArray(value);
}

function convertParamValue(value: any): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Flattens params the same way axios' `toFormData` visitor does for the
 * default `paramsSerializer` (`indexes: false` => `a[]=1&a[]=2`,
 * nested objects => `a[b]=1`).
 */
function flattenParams(
  params: Record<string, any>,
  options: { indexes?: boolean | null; dots?: boolean },
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const indexes = options.indexes === undefined ? false : options.indexes;
  const dots = !!options.dots;

  const removeBrackets = (key: string) =>
    key.endsWith('[]') ? key.slice(0, -2) : key;

  const renderKey = (
    path: Array<string | number> | undefined,
    key: string | number,
  ) => {
    if (!path) return String(key);
    return path
      .concat(key)
      .map((token, i) => {
        const t = removeBrackets(String(token));
        return !dots && i ? `[${t}]` : t;
      })
      .join(dots ? '.' : '');
  };

  const visit = (
    value: any,
    key: string | number,
    path?: Array<string | number>,
  ): boolean => {
    if (value && !path && typeof value === 'object') {
      if (typeof key === 'string' && key.endsWith('{}')) {
        pairs.push([key, JSON.stringify(value)]);
        return false;
      }
      const isFlatArray = Array.isArray(value) && !value.some(isVisitable);
      if (
        isFlatArray ||
        (typeof key === 'string' && key.endsWith('[]') && Array.isArray(value))
      ) {
        const base = removeBrackets(String(key));
        value.forEach((el: any, index: number) => {
          if (el === undefined || el === null) return;
          const name =
            indexes === true
              ? renderKey([base], index)
              : indexes === null
                ? base
                : `${base}[]`;
          pairs.push([name, convertParamValue(el)]);
        });
        return false;
      }
    }
    if (isVisitable(value)) return true;
    pairs.push([renderKey(path, key), convertParamValue(value)]);
    return false;
  };

  const build = (value: any, path?: Array<string | number>) => {
    const entries: Array<[string | number, any]> = Array.isArray(value)
      ? value.map((v, i) => [i, v])
      : Object.keys(value).map(k => [k, value[k]]);
    for (const [rawKey, el] of entries) {
      if (el === undefined || el === null) continue;
      const key = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
      if (visit(el, key, path)) {
        build(el, path ? path.concat(key) : [key]);
      }
    }
  };

  build(params);
  return pairs;
}

/**
 * Appends `params` to `url` exactly like axios' `buildURL`.
 */
export function buildURL(
  url: string,
  params: any,
  paramsSerializer?: AxiosParamsSerializer,
): string {
  if (!params) return url;

  const options =
    typeof paramsSerializer === 'function'
      ? { serialize: paramsSerializer }
      : paramsSerializer || {};
  const encode = options.encode || encodeParam;

  let serialized: string;
  if (options.serialize) {
    serialized = options.serialize(params, options);
  } else if (params instanceof URLSearchParams) {
    serialized = params.toString();
  } else if (typeof params === 'object') {
    serialized = flattenParams(params, options)
      .map(([key, value]) => `${encode(key)}=${encode(value)}`)
      .join('&');
  } else {
    serialized = '';
  }

  if (!serialized) return url;

  const hashIndex = url.indexOf('#');
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  return base + (base.indexOf('?') === -1 ? '?' : '&') + serialized;
}

/**
 * Url-encodes form data for postForm/putForm/patchForm. Nested objects and
 * arrays use the same bracket notation as params (`a[b]=1`, `list[]=1`).
 */
export function toUrlEncodedForm(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data instanceof URLSearchParams) return data.toString();
  return flattenParams(data, {})
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join('&');
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

function forEachHeader(
  headers: any,
  fn: (key: string, value: any) => void,
): void {
  if (!headers) return;
  if (Array.isArray(headers)) {
    // undici raw headers: [k1, v1, k2, v2, ...] or [[k, v], ...]
    if (headers.length && Array.isArray(headers[0])) {
      headers.forEach(([key, value]: [string, any]) => fn(key, value));
    } else {
      for (let i = 0; i + 1 < headers.length; i += 2)
        fn(headers[i], headers[i + 1]);
    }
    return;
  }
  if (!isPlainObject(headers) && typeof headers.toJSON === 'function') {
    // AxiosHeaders (ours or the axios package's)
    const json = headers.toJSON();
    Object.keys(json).forEach(key => fn(key, json[key]));
    return;
  }
  if (!isPlainObject(headers) && typeof headers.forEach === 'function') {
    // WHATWG Headers / Map
    headers.forEach((value: any, key: string) => fn(key, value));
    return;
  }
  Object.keys(headers).forEach(key => fn(key, headers[key]));
}

/**
 * Case-insensitively merges header sources (later sources win). A header
 * explicitly set to `undefined`, `null` or `false` removes any value a
 * lower-priority source set for it, as in axios (`AxiosHeaders#toJSON`
 * drops all three); a source that is itself `undefined`/`null` (no headers
 * given at all) is simply skipped.
 */
export function mergeHeaders(...sources: any[]): HeaderRecord {
  const merged = new Map<string, [string, any]>();
  for (const source of sources) {
    forEachHeader(source, (key, value) => {
      const lower = key.toLowerCase();
      if (value === undefined || value === null || value === false) {
        merged.delete(lower);
      } else {
        merged.set(lower, [
          key,
          Array.isArray(value) ? value.map(String) : String(value),
        ]);
      }
    });
  }
  const result: HeaderRecord = {};
  merged.forEach(([key, value]) => {
    result[key] = value;
  });
  return result;
}

function findHeader(headers: HeaderRecord, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

function setHeaderIfMissing(
  headers: HeaderRecord,
  name: string,
  value: string,
): void {
  if (findHeader(headers, name) === undefined) headers[name] = value;
}

/** Sets a header, replacing any existing case-insensitive match (and its casing). */
function setHeader(headers: HeaderRecord, name: string, value: string): void {
  const existing = Object.keys(headers).find(
    key => key.toLowerCase() === name.toLowerCase(),
  );
  if (existing) delete headers[existing];
  headers[name] = value;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function isStreamLike(value: any): boolean {
  return (
    !!value && typeof value === 'object' && typeof value.pipe === 'function'
  );
}

function isGlobalFormData(value: unknown): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

/**
 * Encodes a WHATWG FormData (the Node.js global) as a multipart stream.
 *
 * The global FormData belongs to the undici copy bundled with Node.js, which
 * the `undici` package's `request()` cannot always encode (the request hangs),
 * so it is encoded with the global `Response` instead.
 */
function globalFormDataToStream(
  form: FormData,
  headers: HeaderRecord,
): Readable {
  const encoded = new Response(form);
  const contentType = encoded.headers.get('content-type');
  const current = findHeader(headers, 'content-type');
  if (contentType && (!current || !String(current).includes('boundary='))) {
    Object.keys(headers).forEach(key => {
      if (key.toLowerCase() === 'content-type') delete headers[key];
    });
    headers['Content-Type'] = contentType;
  }
  return Readable.fromWeb(encoded.body as any);
}

/**
 * Serialises `data` like axios' default `transformRequest` and returns the
 * undici body. May add a Content-Type header to `headers`.
 */
export function serializeRequestData(
  data: any,
  headers: HeaderRecord,
  method: string,
): any {
  const contentType = String(findHeader(headers, 'content-type') || '');
  let body: any;

  if (
    data === undefined ||
    data === null ||
    (!data && typeof data !== 'object')
  ) {
    // axios sends no body for null/undefined and falsy primitives (0, false, '')
    body = undefined;
  } else if (isGlobalFormData(data)) {
    body = globalFormDataToStream(data, headers);
  } else if (isStreamLike(data) && typeof data.getHeaders === 'function') {
    // `form-data` package: copy its multipart headers and stream it
    Object.entries(data.getHeaders() as Record<string, string>).forEach(
      ([key, value]) => setHeaderIfMissing(headers, key, value),
    );
    body = data.pipe(new PassThrough());
  } else if (
    typeof data === 'object' &&
    (data as any)[Symbol.toStringTag] === 'FormData'
  ) {
    // e.g. `FormData` from the `undici` package: undici encodes it natively
    // and sets multipart/form-data with the boundary itself
    body = data;
  } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
    body = data;
    // axios' Node adapter sets Content-Type from the Blob's own `type`
    // whenever it has content - overriding even a header the caller set
    // explicitly. An empty Blob is left alone (falls through to the
    // POST/PUT/PATCH default below, like axios).
    if (data.size) {
      setHeader(
        headers,
        'Content-Type',
        data.type || 'application/octet-stream',
      );
    }
  } else if (Buffer.isBuffer(data) || isStreamLike(data)) {
    body = data;
  } else if (data instanceof ArrayBuffer) {
    body = Buffer.from(data);
  } else if (ArrayBuffer.isView(data)) {
    body = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else if (data instanceof URLSearchParams) {
    setHeaderIfMissing(
      headers,
      'Content-Type',
      `${FORM_URLENCODED};charset=utf-8`,
    );
    body = data.toString();
  } else if (
    typeof data === 'object' &&
    contentType.includes(FORM_URLENCODED)
  ) {
    body = new URLSearchParams(flattenParams(data, {})).toString();
  } else if (
    typeof data === 'object' ||
    contentType.includes('application/json')
  ) {
    setHeaderIfMissing(headers, 'Content-Type', 'application/json');
    body = typeof data === 'string' ? data : JSON.stringify(data);
  } else {
    body = typeof data === 'string' ? data : String(data);
  }

  // axios' dispatchRequest default for methods with a body (undici sets the
  // multipart Content-Type of its own FormData itself)
  const isFormData = !!body && (body as any)[Symbol.toStringTag] === 'FormData';
  if (
    !isFormData &&
    (method === 'POST' || method === 'PUT' || method === 'PATCH')
  ) {
    setHeaderIfMissing(headers, 'Content-Type', FORM_URLENCODED);
  }

  return body;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Combines an AbortSignal and an axios CancelToken into a single signal.
 */
function resolveSignal(
  signal: AbortSignal | undefined,
  cancelToken: AxiosCancelTokenLike | undefined,
): AbortSignal | undefined {
  if (!cancelToken) return signal;

  const controller = new AbortController();
  const abort = (reason: any) => {
    if (!controller.signal.aborted) controller.abort(reason);
  };

  if (cancelToken.reason) {
    abort(cancelToken.reason);
  } else if (typeof cancelToken.subscribe === 'function') {
    cancelToken.subscribe(abort);
  } else if (cancelToken.promise) {
    cancelToken.promise.then(abort, () => undefined);
  }

  if (signal) {
    if (signal.aborted) abort(signal.reason);
    else
      signal.addEventListener('abort', () => abort(signal.reason), {
        once: true,
      });
  }
  return controller.signal;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const METHOD_HEADER_KEYS = new Set([
  'common',
  'get',
  'delete',
  'head',
  'options',
  'post',
  'put',
  'patch',
]);

function hasOwnKeys(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  }
  return false;
}

function flatDefaultHeaders(
  headers: Record<string, any> | undefined,
): HeaderRecord | undefined {
  if (!headers) return undefined;
  let flat: HeaderRecord | undefined;
  for (const key of Object.keys(headers)) {
    if (!METHOD_HEADER_KEYS.has(key) && headers[key] !== undefined) {
      (flat ??= {})[key] = headers[key];
    }
  }
  return flat;
}

/**
 * Detects the `request(config)` call form (`{ url, method, ... }`), as opposed
 * to `request(url, options)` where `url` may also be a URL or UrlObject.
 */
export function isAxiosRequestConfig(
  value: unknown,
): value is { url?: Url } & Record<string, any> {
  return (
    !!value &&
    typeof value === 'object' &&
    !(value instanceof URL) &&
    'url' in (value as Record<string, unknown>)
  );
}

/**
 * Normalises both `request(url, options)` and `request(config)` call forms
 * into the undici-level `(url, options)` pair used by HttpService, applying
 * axios semantics for `baseURL`, `params`/`paramsSerializer`, `data`,
 * `headers` (merged with module and `axiosRef.defaults` headers), `auth`,
 * `timeout`, `maxRedirects` and `cancelToken`.
 *
 * Module-level values are read from the raw module options, so they apply to
 * both `register()` and `registerAsync()`.
 */
export function normalizeAxiosRequest(
  urlOrConfig: Url | ({ url?: Url } & Record<string, any>),
  requestOptions: Record<string, any> | undefined,
  context: AxiosRequestContext = {},
): { url: Url; options: Record<string, any> } {
  let url: Url;
  let input: Record<string, any>;
  if (isAxiosRequestConfig(urlOrConfig)) {
    input = { ...urlOrConfig, ...requestOptions };
    url = urlOrConfig.url ?? '';
  } else {
    input = requestOptions || {};
    url = urlOrConfig as Url;
  }

  const defaults = context.defaults;
  const instance = context.instanceOptions || {};
  const defaultHeaders = defaults?.headers;
  const instanceHeaders = instance.headers as Record<string, any> | undefined;
  const method = String(input.method || 'GET').toUpperCase();
  const lowerMethod = method.toLowerCase() as 'get';
  const methodHeaders = defaultHeaders?.[lowerMethod];
  const flatHeaders = flatDefaultHeaders(defaultHeaders);
  // Module (`register()`/`registerAsync()`) headers may use the same
  // axios-style `{ common: {...}, post: {...}, 'X-Flat': '...' }` shape as
  // `axiosRef.defaults.headers` (item 11: they must be flattened per method,
  // not sent as literal `common`/`post` headers).
  const instanceMethodHeaders = instanceHeaders?.[lowerMethod];
  const instanceFlatHeaders = flatDefaultHeaders(instanceHeaders);

  const baseURL = input.baseURL ?? defaults?.baseURL ?? instance.baseURL;
  const auth = input.auth ?? instance.auth;
  const defaultTimeout =
    defaults?.timeout ??
    (instance.headersTimeout === undefined ? instance.timeout : undefined);
  const maxRedirects = input.maxRedirects ?? instance.maxRedirects;

  // Fast path: nothing axios-specific to do for this request. In practice
  // this only triggers for calls that bypass HttpService's axiosRef defaults
  // entirely (defaultHeaders?.common always carries the default Accept /
  // User-Agent / Accept-Encoding headers once a service is set up).
  const needsWork =
    AXIOS_ONLY_KEYS.some(key => input[key] !== undefined) ||
    (input.method !== undefined && input.method !== method) ||
    input.headers !== undefined ||
    (typeof url === 'string' && !!baseURL) ||
    instance.params !== undefined ||
    auth !== undefined ||
    (defaultTimeout !== undefined && input.timeout === undefined) ||
    (maxRedirects !== undefined && input.maxRedirections === undefined) ||
    hasOwnKeys(defaultHeaders?.common) ||
    hasOwnKeys(methodHeaders) ||
    flatHeaders !== undefined ||
    hasOwnKeys(instanceHeaders);
  if (!needsWork) {
    return { url, options: input };
  }

  const {
    url: _url,
    baseURL: _baseURL,
    params,
    paramsSerializer,
    data,
    auth: _auth,
    cancelToken,
    maxRedirects: _maxRedirects,
    ...options
  } = input;
  options.method = method;

  // URL: baseURL + params
  if (typeof url === 'string' && baseURL && !isAbsoluteURL(url)) {
    url = combineURLs(baseURL, url);
  }
  const mergedParams =
    isPlainObject(instance.params) && isPlainObject(params)
      ? { ...instance.params, ...params }
      : (params ?? instance.params);
  if (mergedParams) {
    url = buildURL(
      url.toString(),
      mergedParams,
      paramsSerializer ?? instance.paramsSerializer,
    );
  }

  // Headers, lowest to highest priority: axiosRef defaults (the axios-style
  // request defaults, including the built-in Accept/User-Agent/
  // Accept-Encoding) -> module (`register()`) headers -> per-request headers.
  // Each axios-style source is itself `common` -> `<method>` -> flat, so a
  // header set for one method (or unqualified) is overridden by a more
  // specific one from the same source before the next source is applied.
  const headers = mergeHeaders(
    defaultHeaders?.common,
    methodHeaders,
    flatHeaders,
    instanceHeaders?.common,
    instanceMethodHeaders,
    instanceFlatHeaders,
    options.headers,
  );

  // `auth` overrides any Authorization header, as in axios
  if (auth) {
    const token = Buffer.from(
      `${auth.username || ''}:${auth.password || ''}`,
    ).toString('base64');
    Object.keys(headers).forEach(key => {
      if (key.toLowerCase() === 'authorization') delete headers[key];
    });
    headers.Authorization = `Basic ${token}`;
  }

  if (options.body === undefined) {
    if (data !== undefined) {
      options.body = serializeRequestData(data, headers, method);
    } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      // axios' dispatchRequest sets this default unconditionally for these
      // 3 methods, even with no `data` at all (`config.headers
      // .setContentType('application/x-www-form-urlencoded', false)`).
      setHeaderIfMissing(headers, 'Content-Type', FORM_URLENCODED);
    }
  }
  options.headers = headers;

  if (maxRedirects !== undefined && options.maxRedirections === undefined) {
    options.maxRedirections = maxRedirects;
  }
  if (options.timeout === undefined && defaultTimeout !== undefined) {
    options.timeout = defaultTimeout;
  }

  const signal = resolveSignal(options.signal, cancelToken);
  if (signal) options.signal = signal;

  return { url, options };
}
