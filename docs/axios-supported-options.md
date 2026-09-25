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
| `axiosRef.interceptors.request/response.use()` | ✅ | Runs in axios' own order: request interceptors last-registered-first, response interceptors first-registered-first. `runWhen`/`synchronous` (3rd argument) are honoured. |
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
| `maxRedirects` | ✅ | Follows up to 21 redirects by default, like axios. `maxRedirects: 0` returns the 3xx response as-is, through `validateStatus` like any other status. 301/302 turn `POST` into `GET`; 303 turns anything but `HEAD` into `GET` (both drop the body and `Content-*` headers); 307/308 keep the method and body. `Authorization`/`Cookie`/`Proxy-Authorization` are dropped across a protocol downgrade or a host (including port) change. Exceeding the limit rejects with `ERR_FR_TOO_MANY_REDIRECTS` ("Maximum number of redirects exceeded"), with no `response` - same as axios. A streamed request body (a `Readable`, not a `Buffer`/string/`FormData`) can't be resent on a redirect that keeps it (307/308, or a non-POST 301/302): that rejects with `ERR_FR_REDIRECTION_FAILURE` instead of sending a broken request; buffer the body yourself first, or use `maxRedirects: 0`. |
| `beforeRedirect` | ✅ | Called before each hop with `(options, responseDetails, requestDetails)`, like axios; mutating `options.headers`/`.method`/`.protocol`/`.hostname`/`.port`/`.path` changes the next hop. Also settable at module level (`register({ beforeRedirect })`). |
| `responseType: 'json' \| 'text' \| 'arraybuffer' \| 'blob' \| 'stream'` | ✅ | `arraybuffer` gives a `Buffer`; `blob` gives a UTF-8 string, matching axios in Node.js (no native `Blob` decoding there); `stream` gives the undici body (a Node.js `Readable`, transparently decompressed like axios). |
| `maxContentLength` | ⚠️ | Enforced, but the error code is `ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED` (axios: `ERR_BAD_RESPONSE`). |
| `decompress` | ✅ | gzip/br/deflate are decompressed when `Content-Encoding` is set. `decompress: false` returns the raw compressed body, as in axios. |
| `transformRequest` / `transformResponse` per request | ✅ | Replaces default serialisation/parsing entirely, like axios: `transformRequest` gets the raw `data`; `transformResponse` gets the raw response body (not yet JSON-parsed). |
| `socketPath` per request | ✅ | `Agent({ connect: { socketPath } })`, cached per path. Overrides a module-level `socketPath`. |
| `proxy`, `httpAgent`, `httpsAgent`, `withCredentials`, `maxBodyLength` per request | ❌ | Module-level only (see below). |
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
| `response.request` | ⚠️ | A placeholder object, not the underlying request. `response.request.res.responseUrl` is set to the final hop's URL once a redirect was followed (unset otherwise), matching axios' `responseUrl`. |

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
| `maxRedirects`, `beforeRedirect` | ✅ | Applied to every request as the default; a per-request value wins. See [Request config](#request-config). |
| `maxBodyLength` / `maxContentLength` | ⚠️ | Size-limit checks (see error code note above). |
| `transformRequest` / `transformResponse` | ✅ | Replaces default serialisation/parsing entirely, like axios: `transformRequest` receives the raw `data`, `transformResponse` receives the raw response body (not yet JSON-parsed). |
| `httpAgent` / `httpsAgent` | ✅ | `maxSockets` → undici `connections`, `keepAlive` → `pipelining`, `timeout` → header/body timeouts (only when no module/request `timeout` is set). `httpsAgent`'s TLS options (`ca`, `cert`, `key`, `pfx`, `passphrase`, `rejectUnauthorized`, `servername`, `ciphers`, `minVersion`, `maxVersion`) map onto undici's `Agent({ connect: {...} })`. Module-level only - a per-request `httpAgent`/`httpsAgent` is ignored. |
| `proxy` | ✅ | An explicit `proxy: { host, port, protocol?, auth? }` creates an undici `ProxyAgent`. `proxy: false` disables proxying entirely, including the environment variables below. |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` (and lower-case) | ✅ | Read once at module setup via undici's `EnvHttpProxyAgent`, matching axios' own default (`proxy-from-env`) - **only** when no `dispatcher`, `proxy` or `socketPath` is configured. As in axios, a custom `httpAgent`/`httpsAgent` doesn't turn this off; its TLS options still apply, including to targets reached through the proxy. This is a behaviour change from earlier versions, which never read these variables: with `HTTP_PROXY` set in the environment, a request to `http://127.0.0.1:...` now goes through that proxy by default unless `NO_PROXY` covers it or `proxy: false` is passed. See the note below. |
| `withCredentials` | ⚠️ | Enables a cookie jar (`http-cookie-agent` + `tough-cookie`) that stores and resends cookies, which axios does not do in Node.js. |
| `socketPath` | ✅ | `Agent({ connect: { socketPath } })`, cached per path. Works at module level and per request; the request URL's host is still used for the `Host` header, as in axios. |
| `httpVersion` | ✅ | `httpVersion: 2` → `Agent({ allowH2: true })`. Module-level only; needs a target that speaks HTTP/2 over TLS (undici has no plaintext HTTP/2). `http2Options` is accepted but has no effect (undici has no per-session HTTP/2 tuning). |
| `decompress` | ✅ | Applied as the default for every request; a per-request `decompress` overrides it. |
| `xsrfCookieName`, `xsrfHeaderName` | ❌ | Ignored (a warning is logged). |

### Precedence: an explicit `dispatcher` always wins

A `dispatcher` passed directly in module options (`register({ dispatcher })`) is never overridden by `httpAgent`/`httpsAgent`, `socketPath`, `proxy` or the `HTTP_PROXY`/`HTTPS_PROXY` environment variables - none of that mapping runs once a `dispatcher` is set. A per-request `dispatcher` wins over all of those too, including a per-request `socketPath`. Use this to configure undici directly when the axios-shaped options above aren't expressive enough (see [Performance Note](#performance-note)).

A request-level `socketPath` gets its own cached `Agent` per path (at most 32 paths; the oldest is closed to make room), so use a small, fixed set of socket paths.

Dispatchers this module creates (from `httpAgent`/`httpsAgent`/`socketPath`/`proxy`/env-proxy/`httpVersion`) are not yet closed on `app.close()` - see `OnModuleDestroy` in the migration guide's known gaps.

### Connection pooling and TLS: `httpAgent` / `httpsAgent`

```typescript
import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';

HttpModule.register({
  httpAgent: new Agent({ keepAlive: true, maxSockets: 10 }),
});

// TLS options (module-level only)
HttpModule.register({
  httpsAgent: new HttpsAgent({
    ca: fs.readFileSync('ca.pem'),
    rejectUnauthorized: true, // false to trust any certificate (e.g. local dev)
  }),
});
```

### Unix domain sockets: `socketPath`

```typescript
HttpModule.register({ socketPath: '/var/run/docker.sock' });
// or per request:
httpService.get('http://localhost/containers/json', { socketPath: '/var/run/docker.sock' });
```

### HTTP/2

```typescript
HttpModule.register({
  httpVersion: 2,
  httpsAgent: new HttpsAgent({ rejectUnauthorized: false }), // if needed for the target's cert
});
```

### Proxy

An explicit `proxy` always wins over the environment variables below:

```typescript
HttpModule.register({
  proxy: {
    host: 'proxy.example.com',
    port: 8080,
    auth: { username: 'user', password: 'pass' },
  },
});
```

With no `proxy` (and no `dispatcher`/`socketPath`), `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (case-insensitive) are read once at module setup, matching axios:

```bash
HTTP_PROXY=http://proxy.example.com:8080 NO_PROXY=localhost,127.0.0.1,.internal node app.js
```

```typescript
// Opt out entirely, even with HTTP_PROXY/HTTPS_PROXY set in the environment:
HttpModule.register({ proxy: false });
```

**Behaviour change / risk:** earlier versions of this library never read `HTTP_PROXY`/`HTTPS_PROXY`. If your environment sets them (common in corporate networks and some CI runners) and you don't pass `proxy: false`, requests - including ones to `localhost`/`127.0.0.1` - now go through that proxy by default unless `NO_PROXY` covers the target. This matches axios, but if you rely on `HttpModule.register({})` never proxying, either set `proxy: false` or add your local hosts to `NO_PROXY`.

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
