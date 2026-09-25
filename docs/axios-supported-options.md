# Axios Compatibility and Supported Options

This page lists what works when you switch from `@nestjs/axios` to `nestjs-axios-undici`, and what behaves differently. Every row is covered by a side-by-side test against real axios / `@nestjs/axios` in [`tests/axios-compatibility-matrix.e2e.spec.ts`](https://github.com/yordan-kanchelov/nestjs-axios-undici/blob/main/tests/axios-compatibility-matrix.e2e.spec.ts).

Legend: ✅ same as axios · ⚠️ works with a documented difference · ❌ not supported

## HttpService

| Feature | Status | Notes |
|---------|:------:|-------|
| `request(config)` (`{ url, method, params, data, ... }`) | ✅ | Same call form as `@nestjs/axios`. `request(url, options)` (undici style) still works. |
| `get`, `delete`, `head`, `post`, `put`, `patch` | ✅ | |
| `options` | ✅ | Not available in `@nestjs/axios`. |
| `postForm` / `putForm` / `patchForm` with `FormData` | ✅ | Sent as `multipart/form-data`. |
| `postForm` / `putForm` / `patchForm` with a plain object | ⚠️ | Sent url-encoded; axios sends `multipart/form-data`. |
| Unsubscribing aborts the request | ✅ | Unsubscribing before the response arrives (`timeout()`, `switchMap`, `takeUntil`, `race`, ...) aborts the upstream request, as in `@nestjs/axios`. Not aborted once the response (or, for `responseType: 'stream'`, the headers) has been emitted. |

## `axiosRef`

| Feature | Status | Notes |
|---------|:------:|-------|
| `axiosRef.interceptors.request/response.use()` | ⚠️ | Request interceptors run in registration order (axios: reverse order); response interceptors run in reverse registration order (axios: registration order). |
| `interceptors.*.eject(id)` / `clear()` | ✅ | |
| `axiosRef.defaults.headers.common[...]`, `.get/.post/...[...]` | ✅ | Applied to every later request. |
| `axiosRef.defaults.baseURL` / `.timeout` | ✅ | |
| `axiosRef.get/post/put/patch/delete/head/options/request()` returning a Promise | ✅ | |
| Other `AxiosInstance` members (`axiosRef(config)`, `getUri`, `create`, ...) | ❌ | |

## Request config

Per-request options (third argument of `post`, second of `get`, or the `request(config)` object):

| Option | Status | Notes |
|--------|:------:|-------|
| `baseURL` | ✅ | Joined like axios (`http://api/v1` + `/users` → `http://api/v1/users`). |
| `params` (objects, arrays, nested objects, dates, `URLSearchParams`) | ✅ | Same encoding as axios (`a[]=1&a[]=2`, `obj[k]=v`). |
| `paramsSerializer` (function or `{ serialize, encode, indexes }`) | ✅ | |
| `headers` (plain object or `AxiosHeaders`) | ✅ | Merged case-insensitively with module headers and `axiosRef.defaults.headers`. A header set to `undefined`/`null` removes a default, as in axios. |
| Default `Accept`, `User-Agent`, `Accept-Encoding` headers | ⚠️ | `Accept: application/json, text/plain, */*` and `Content-Type` defaults match axios exactly. `User-Agent` is `nestjs-axios-undici/<version>` (axios: `axios/<version>`) - override it the axios way, `axiosRef.defaults.headers.common['User-Agent'] = '...'`. `Accept-Encoding` lists `gzip, deflate, br` (axios also advertises `compress`, an old scheme neither library decodes) and is only sent when decompression is enabled at module level (`register({ decompress: false })` omits it; a per-request `decompress: false` keeps the header and returns the raw compressed bytes, as axios does). Seeded into `axiosRef.defaults.headers.common` at setup; module `headers` and per-request `headers` override them (module `headers` also win over any other `axiosRef.defaults` header). |
| `data`: object → JSON, string, `URLSearchParams`, `Buffer`/typed arrays, streams, `FormData` (global or the `form-data` package) | ✅ | Same `Content-Type` defaults as axios. |
| `auth` | ✅ | Becomes `Authorization: Basic ...` and overrides an existing Authorization header, as in axios. |
| `timeout` | ⚠️ | Rejects with `ECONNABORTED` / `timeout of Nms exceeded`. Implemented with undici's `headersTimeout`/`bodyTimeout`, which have ~1s resolution, so sub-second timeouts fire late. |
| `signal` (`AbortController`) | ✅ | Rejects with `CanceledError` (`ERR_CANCELED`). |
| `cancelToken` | ✅ | Rejects with `CanceledError` carrying the cancel message. |
| `validateStatus` | ⚠️ | Works; `validateStatus: null` is treated as the default (axios accepts every status). |
| `maxRedirects` | ⚠️ | Honoured when set. Without it redirects are **not** followed (axios follows up to 21). When the limit is exceeded the last 3xx is returned as a status error instead of `ERR_FR_TOO_MANY_REDIRECTS`. |
| `responseType: 'json' \| 'text' \| 'arraybuffer' \| 'blob' \| 'stream'` | ✅ | `arraybuffer` gives a `Buffer`; `blob` gives a UTF-8 string, matching axios in Node.js (no native `Blob` decoding there); `stream` gives the undici body (a Node.js `Readable`, transparently decompressed like axios). |
| `maxContentLength` | ⚠️ | Enforced, but the error code is `ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED` (axios: `ERR_BAD_RESPONSE`). |
| `decompress` | ✅ | gzip/br/deflate are decompressed when `Content-Encoding` is set. `decompress: false` returns the raw compressed body, as in axios. |
| `proxy`, `httpAgent`, `httpsAgent`, `withCredentials`, `maxBodyLength`, `transformRequest`, `transformResponse` per request | ❌ | Module-level only (see below). |
| `xsrfCookieName` / `xsrfHeaderName`, `onUploadProgress` / `onDownloadProgress`, `adapter` | ❌ | |

## Response

| Feature | Status | Notes |
|---------|:------:|-------|
| `status`, `statusText`, `headers['x-name']` | ✅ | Header names are lower-case, as in axios. `statusText` is the server's actual reason phrase. |
| JSON body with a JSON `Content-Type` (`application/json`, and any `+json` suffix like `application/problem+json`) | ✅ | Invalid JSON gives the raw string, an empty body gives `''`. |
| `204` / empty body | ✅ | `data` is `''`. |
| JSON-looking body with a non-JSON `Content-Type` (e.g. `text/plain`, no `Content-Type`) | ✅ | Parsed as JSON, like axios' `forcedJSONParsing`; falls back to the raw string silently if parsing fails. |
| Text-ish `Content-Type` (`text/*`, `application/xml`, `application/javascript`, `application/x-www-form-urlencoded`, `image/svg+xml`, `application/octet-stream`, no `Content-Type`) | ✅ | Decoded to a UTF-8 string, like axios' default `responseType: 'json'` handling. |
| Other binary `Content-Type` (images, PDFs, ...) | ⚠️ | Returned as a `Buffer`; axios also returns a UTF-8 string unless `responseType: 'arraybuffer'` is set (harder to use correctly, so this library keeps it a `Buffer` by default). Set `responseType: 'arraybuffer'` for binary downloads either way. |
| `Content-Encoding: gzip \| br \| deflate` | ✅ | Decompressed automatically; `decompress: false` opts out. |
| `response.headers` as `AxiosHeaders` (`headers.get()`) | ❌ | A plain object. |
| `response.config` | ⚠️ | Contains `url` (final URL including query string), `method` (upper-case), `headers`, `timeout`, `validateStatus`; no `params`, `baseURL` or `data`. |
| `response.request` | ❌ | Not set. |

## Errors

| Feature | Status | Notes |
|---------|:------:|-------|
| `axios.isAxiosError(error)` / `error.isAxiosError` | ✅ | For status, network, timeout and cancellation errors. |
| `error.code` | ✅ | `ERR_BAD_REQUEST` (4xx), `ERR_BAD_RESPONSE` (5xx and others), `ECONNABORTED` (timeout), `ERR_CANCELED`, and network codes such as `ECONNREFUSED`/`ENOTFOUND`. Undici socket errors map to `ECONNRESET`. |
| `error.message` | ✅ | Same messages as axios (`Request failed with status code 404`, `timeout of 200ms exceeded`, `canceled`, ...). |
| `error.response`, `error.config`, `error.status`, `error.toJSON()` | ✅ | |
| `axios.isCancel(error)` | ✅ | |
| `error instanceof AxiosError` | ⚠️ | True for the `AxiosError` / `CanceledError` classes exported by this package, **not** for the class from the `axios` package. Use `isAxiosError()` (from either package) instead. |
| `error.cause` | ✅ | The original undici/Node.js error for network, timeout and cancellation errors. |

```typescript
import { AxiosError, isAxiosError, isCancel } from 'nestjs-axios-undici';
```

## HttpModule

| Feature | Status | Notes |
|---------|:------:|-------|
| `HttpModule` imported without `register()` | ✅ | |
| `register(options)` | ✅ | |
| `registerAsync({ useFactory, inject, imports })` | ✅ | Axios options are mapped exactly like in `register()`. |
| `registerAsync({ useClass })` / `({ useExisting })` | ✅ | |
| `extraProviders`, `global` | ✅ | |
| Class-based interceptors in `registerAsync()` options | ✅ | Dependencies are resolved from `imports` and `extraProviders`; see [Interceptors with dependencies](/docs/guides/interceptors.md#interceptors-with-dependencies). |

## Module-level axios options

`HttpModule.register()` and `HttpModule.registerAsync()` detect these axios options:

| Option | Status | Notes |
|--------|:------:|-------|
| `baseURL`, `headers`, `auth`, `params`, `paramsSerializer`, `timeout`, `validateStatus`, `responseType` | ✅ | Applied to every request; per-request values win (headers and params are merged). `timeout` maps to undici's `headersTimeout`/`bodyTimeout`. `headers` accepts axios' method-keyed shape (`{ common: {...}, post: {...}, 'X-Flat': '...' }`), flattened per method at setup. |
| `maxRedirects` | ⚠️ | Applied to every request through undici's redirect interceptor. Without it redirects are not followed (see [Request config](#request-config)). |
| `maxBodyLength` / `maxContentLength` | ⚠️ | Size-limit checks (see error code note above). |
| `transformRequest` / `transformResponse` | ⚠️ | Run as interceptors: `transformRequest` receives the already-serialized body (axios: the raw `data`), `transformResponse` receives the parsed `data` (axios: the raw string). |
| `httpAgent` / `httpsAgent` | ⚠️ | `maxSockets` → undici `connections`, `keepAlive` → `pipelining`, `timeout` → header/body timeouts. Other agent options are ignored. |
| `proxy` | ⚠️ | Creates an undici `ProxyAgent` (with basic auth). `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables are not read. |
| `withCredentials` | ⚠️ | Enables a cookie jar (`http-cookie-agent` + `tough-cookie`) that stores and resends cookies, which axios does not do in Node.js. |
| `socketPath` | ❌ | Currently fails with `Invalid URL protocol`. Use `dispatcher: new Agent({ connect: { socketPath } })` from undici instead. |
| `decompress` | ✅ | Applied as the default for every request; a per-request `decompress` overrides it. |
| `xsrfCookieName`, `xsrfHeaderName` | ❌ | Ignored (a warning is logged). |

### Connection pooling: `httpAgent` / `httpsAgent`

```typescript
import { Agent } from 'http';

HttpModule.register({
  httpAgent: new Agent({ keepAlive: true, maxSockets: 10 }),
});
```

### Proxy

```typescript
HttpModule.register({
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
    auth: { username: 'user', password: 'pass' },
  },
});
```

### Size limits

```typescript
HttpModule.register({
  maxBodyLength: 10 * 1024 * 1024,    // 10MB request body limit
  maxContentLength: 50 * 1024 * 1024, // 50MB response content limit
});
```

### Cookies: `withCredentials`

```typescript
HttpModule.register({ withCredentials: true });
```

Combining `httpAgent`/`httpsAgent` with `withCredentials` may not work because the cookie agent wraps the dispatcher. Use them separately or configure undici directly.

### XSRF

XSRF headers are not added automatically. Use an interceptor:

```typescript
const xsrfInterceptor: HttpInterceptorFunction = (request, next) => {
  request.options.headers = { ...request.options.headers, 'X-XSRF-TOKEN': readToken() };
  return next.handle(request);
};

HttpModule.register({ interceptors: [xsrfInterceptor] });
```

## Performance Note

You can skip the axios mapping by configuring undici directly:

```typescript
import { Agent, ProxyAgent } from 'undici';

HttpModule.register({
  dispatcher: new Agent({ connections: 10, pipelining: 1 }), // or new ProxyAgent('http://proxy:8080')
});
```
