# nestjs-axios-undici

## 1.0.0

### Major Changes

- d30b5c5: **1.0.0: a stable, axios-compatible `HttpModule`/`HttpService` on undici.**

  1.0 makes the `@nestjs/axios` drop-in promise hold for real code. Every PR runs `@nestjs/axios`' own specs and axios' own HTTP adapter tests against this package, along with a side-by-side differential harness against `@nestjs/axios`. The remaining differences are listed, each with its reason, on the [Axios compatibility](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options) page.

  Highlights since 0.6:

  - **Behaviour matches axios:**
    - redirects are followed by default, like axios;
    - `axiosRef` is a real axios-like instance (callable, `create`, `getUri`, `*Form`, function adapters);
    - interceptor order and `config` shape follow axios;
    - errors (codes, timeouts, `maxContentLength`/`maxBodyLength`, cancellation) follow axios;
    - response decoding covers gzip, deflate, br, zstd and compress;
    - duplicate response headers are joined as in axios;
    - `data:` URLs, progress callbacks, `maxRate`, `formSerializer`, `parseReviver`, `sensitiveHeaders` and strict JSON parsing are supported.
  - **Transport:**
    - TLS through `httpsAgent`;
    - `socketPath`;
    - HTTP(S) and environment proxies;
    - explicit `allowH2`;
    - an opt-in `cookieJar`;
    - a per-module dispatcher that's closed on shutdown.
  - **API:**
    - strict `HttpModuleOptions`;
    - a trimmed public API, checked in CI against `etc/nestjs-axios-undici.api.md`;
    - `axios` as an optional peer, so `instanceof axios.AxiosError` also holds.
  - **Performance:** the gains are kept. CI runs a CPU-per-request regression check on every PR and a full benchmark on release.

  Upgrading from 0.6.x includes breaking changes. The minor entries below mark them **BREAKING**, and the [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide?id=upgrading-from-06x) groups them by area with what to change.

### Minor Changes

- 2e620dc: Trims the public API to a deliberate, explicit export list, checked against a committed [API Extractor](https://api-extractor.com/) report in CI (`etc/nestjs-axios-undici.api.md`, `npm run api:check`/`api:update`) so a future change to the surface is always a reviewed decision.

  **BREAKING: removed, outright (no `@deprecated` step), because each one loses nothing** - either it never did anything, or a supported replacement already exists:

  - The legacy typed module: `TypedHttpModule`, `InjectTypedHttpService`, `ExtractHttpServiceType`, `HTTP_SERVICE_TYPE`, `TypedDynamicModule`. Use `HttpModule`/`HttpService` directly - `HttpModuleOptions` is already strictly typed.
  - `AxiosResponseAdapterInterceptor`/`axiosResponseAdapter` - dead code; `HttpService` already converts every response to the axios-compatible shape itself.
  - `SizeLimitInterceptor`/`createSizeLimitInterceptor`/`SizeLimitOptions` - no longer has a use now that `maxBodyLength`/`maxContentLength` are enforced natively, with the right codes; this interceptor's own response-size check never ran. Use the `maxBodyLength`/`maxContentLength` module/request options instead.
  - `STATUS_TEXT_MAP` - an internal lookup table, never meant to be consumed directly.
  - `HTTP_MODULE_ID` - a provider token that was registered but never injected anywhere; it did nothing.
  - The internal error helpers `toAxiosError`, `createStatusError`, `createTimeoutError`, `createUnsupportedProtocolError`, `isDeadlineTimeoutReason`, plus the `DeadlineTimeoutReason`/`EffectiveAbortSignal` types - implementation details of how this library builds `AxiosError`s. Use `AxiosError`/`isAxiosError`/`isCancel` (still exported) instead.
  - Unused types: `HttpServiceWithAxiosRef`, `BodyMixin`, `CommonResponseHeaders`, `MethodHeaders`.

  **Added: `AxiosRequestConfig`/`AxiosResponse`/`AxiosInstance`**, plain type aliases for this package's own `AxiosLikeRequestConfig`/`AxiosLikeResponse`/`AxiosRef` - so migrating code can drop its own `import ... from 'axios'` purely for these types.

  **`UNDICI_INSTANCE_TOKEN`/`HTTP_MODULE_OPTIONS` stay exported** and are now documented as supported injection tokens for overriding a test module's providers directly (see the [testing guide](/docs/guides/testing.md#overriding-the-modules-own-providers)).

  **`reflect-metadata` is no longer this package's own peer dependency.** Nothing in this library's source imports it; it's still required, transitively, because `@nestjs/common`/`@nestjs/core` themselves declare it as _their_ peer dependency, so any app using this package already has to install it to satisfy Nest itself.

  See the [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide?id=types) for the full list and replacements.

  ***

  `src/version.ts` no longer does a runtime `require('../package.json')` for the default `User-Agent` version - a prebuild/pretest step (`scripts/generate-version.js`) now writes a build-time `LIBRARY_VERSION` constant from `package.json`, so a bundler that prunes non-JS files (or can't resolve a `require()` reaching outside `lib/`) doesn't break it. No behaviour change; a test now asserts the User-Agent version matches `package.json`.

  ***

  Internal only, no behaviour change: the `__agentOptions`/`__proxyAgent` `as any` casts in the axios-config-to-undici option mapping are replaced with one typed, internal `ResolvedModuleConfig` object produced once by `mapAxiosConfigToUndici` and consumed by `HttpService`.

- b23b0bf: Three axios compatibility gaps found by the upstream conformance suite are fixed:

  - **`zstd` decompression.** `Content-Encoding: zstd` responses are now decoded, for both buffered and `responseType: 'stream'`, honouring `decompress`/`decompress: false` and `maxContentLength` (checked against the decompressed size, streamed) exactly like the existing gzip/br/deflate support. Feature-detected the way axios does (`zlib.createZstdDecompress`, present on every Node.js version this package supports - added in Node 22.15.0/23.8.0); on a hypothetical Node build without it, a zstd response is returned as the raw compressed bytes, matching axios' own fallback. The default `Accept-Encoding` still doesn't advertise `zstd` - axios itself only does when `transitional.advertiseZstdAcceptEncoding: true` is explicitly set (default `false`), so this matches axios' own out-of-the-box behaviour; override the header yourself if you want to advertise it.
  - **`parseReviver`.** axios' reviver for the default (no custom `transformResponse`) JSON parsing is now passed to `JSON.parse`. Supported on per-request config, `axiosRef.defaults` and module options (`register({ parseReviver })`), with the same request > `axiosRef.defaults` > module precedence as every other passthrough default. No cost when unset.
  - **Redirect `sensitiveHeaders`.** `config.sensitiveHeaders` (an array of extra header names, validated the same way axios validates it - `ERR_BAD_OPTION_VALUE` otherwise) is now honoured, dropping those headers alongside the built-in `Authorization`/`Cookie`/`Proxy-Authorization` on a redirect. Matches axios' own two-part rule exactly: the built-in 3 stay subdomain-exempt and downgrade-only, while a header named in `sensitiveHeaders` is dropped on _any_ change of origin (including a subdomain redirect or an http→https upgrade). Settable at module level too; a per-request value wins.

  See `docs/axios-supported-options.md` for the details of each. All three were previously listed as known gaps there; that's now updated.

- 6676009: `axiosRef` is now a real, callable axios instance, with full `defaults`, a function `adapter` and casing-preserving `AxiosHeaders` - plan.md phase 2 "feat(axiosRef): make it a real axios instance".

  - `axiosRef(config)` / `axiosRef(url, config)` are callable, resolving like `axios(...)` (what `axios-retry` relies on).
  - `axiosRef` gained `getUri(config?)`, `create(config?)` (a new instance sharing this `HttpService`'s transport/dispatcher and module-level interceptors, with its own `interceptors` and `defaults` merged from this one), `postForm`/`putForm`/`patchForm` and `query`.
  - `HttpService.query()` implements the HTTP `QUERY` method (`@nestjs/axios` 12 / axios ≥1.13).
  - `axiosRef.defaults` now covers `validateStatus`, `params`, `paramsSerializer`, `responseType`, `transformRequest`, `transformResponse`, `adapter` and `withCredentials` (a no-op), on top of the existing `baseURL`/`headers`/`timeout`/`maxRedirects` - all honoured even on a plain request with no axiosRef interceptors registered.
  - A function `adapter` (`config.adapter` or `axiosRef.defaults.adapter`) is called with the final config instead of dispatching through undici, and its response still runs through `validateStatus`/`transformResponse`/response interceptors - this is what makes [`axios-mock-adapter`](https://github.com/ctimmerm/axios-mock-adapter) work against `axiosRef` unmodified. A string adapter name (`'http'`/`'xhr'`/`'fetch'`) is accepted for type compatibility but ignored.

  **BREAKING: `axiosRef.defaults` precedence.** `HttpModule.register()`/`.registerAsync()` options now only _seed_ `axiosRef.defaults` once, at setup - exactly like `axios.create(moduleOptions)` seeds a real axios instance. From then on `axiosRef.defaults` is the single source of truth: a runtime mutation (`axiosRef.defaults.headers.common['X'] = '...'`, `axiosRef.defaults.timeout = 5000`, ...) always wins over the module-level value it started out equal to. This replaces an inconsistent rule from a previous release, where module `headers` specifically always won over `axiosRef.defaults` (but `timeout`/`maxRedirects` already worked the other way) - every field now follows one rule: **request config > `axiosRef.defaults` > module options**. Mutating the object passed to `register()`, or `httpService.undiciRef.headers`, after construction no longer has any effect - mutate `axiosRef.defaults` instead.

  **BREAKING: `postForm`/`putForm`/`patchForm` with a plain object are now multipart**, matching axios' own `postForm` (previously a documented gap: this library sent url-encoded data instead). An explicit `Content-Type` header does not change this - neither does axios' own (confirmed directly against a real axios instance). If you relied on the url-encoded body, use `post()`/`put()`/`patch()` with `data: new URLSearchParams(...)` instead.

  **BREAKING: `AxiosHeaders` casing.** Header names used to be stored lower-cased. They're now stored the way axios itself does: case-insensitive lookup (`get`/`has`/`delete`/`set` are unaffected), but `toJSON()`/`toString()`/`[Symbol.iterator]()` now report the casing a header was _first set with_, and `normalize(true)` actually title-cases every name (previously a no-op). Code reading `Object.keys(headers.toJSON())` or iterating `for (const [key] of headers)` and expecting lower-case keys needs updating - compare case-insensitively, or use `headers.get(name)`/`headers.has(name)` (both still case-insensitive). There is no longer a `forEach()` method on `AxiosHeaders` (axios' own class has none either) - use `for (const [key, value] of headers)` or `Object.entries(headers.toJSON())`. `getAcceptEncoding`/`setAcceptEncoding`/`hasAcceptEncoding` still work at runtime but are no longer part of the declared type, exactly as in axios (which registers them as accessors but doesn't declare them in its `.d.ts`); declaring them would make this class wider than axios' own type. The same reason explains why `AxiosLikeRequestConfig.url` (and its response/config counterparts) is now `string`-only instead of `string | URL`, matching axios' own `AxiosRequestConfig.url?: string` exactly (a `URL`/`UrlObject` is still accepted wherever a URL is given as its own argument - `request(url, options)`, `get(url, config)`, etc. - only `config.url` in the single-argument `request(config)` form is affected).

  Together, these changes make `config.headers`/`response.config.headers` (a real `AxiosHeaders` instance) and `axiosRef` mutually assignable with axios' own `AxiosHeaders`/`AxiosInstance` types in TypeScript - the last 3 `@ts-expect-error` markers this package's own type-compat tests carried for this are down to 2, both narrower and unrelated to `AxiosHeaders` (axios' `Axios.request`/`get`/... carry a 4th generic, `R`, for fully overriding the response type at the type level only, which this library's methods don't mirror; no runtime effect).

  See [`axiosRef`](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/http/http-service?id=axiosref) and [Precedence: `axiosRef.defaults`](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=precedence-axiosrefdefaults) for the full picture, and the migration guide for the complete breaking-change list.

- 7b3d694: CodeRabbit review fixes (transformResponse size limit, metered decompression, `axiosRef(config)`, `create()`/`defaults`):

  - **Security: `maxContentLength` now applies with a custom `transformResponse`.** A custom `transformResponse` (module-, `defaults`- or request-level) combined with a `text`/`json`/default `responseType` used to read the whole decoded body via `readText` without ever passing `maxContentLength` through - so an oversized plain body, or a gzip/br/deflate/zstd body that decompresses to something huge, was fully buffered (and, for a compressed body, fully decompressed) before any size limit could apply. `maxContentLength` is now threaded into that call, matching every other body-reading call site: it's enforced while reading, and a compressed body is rejected via the existing streamed/early-abort decompression path instead of being decoded in full first.
  - **Fix: a metered download of a compressed response with no `maxContentLength` no longer throws a `TypeError`.** With `onDownloadProgress`/download `maxRate` set and no `maxContentLength`, `readText`'s unlimited-decompression branch called `body.arrayBuffer()` directly - the metered body (`ByteMeterStream`) is a plain Node `Transform`, which has no `.arrayBuffer()`, so a gzip/br/deflate/zstd response rejected with a `TypeError` instead of resolving. It now goes through the same fallback (`bodyArrayBuffer`) `readBuffer` already used.
  - **Fix: `axiosRef(config)` with no `url` key.** `axiosRef({ baseURL, method: 'get' })` - a config with no `url` set, resolved later via `baseURL` or a request interceptor, exactly as axios itself allows - used to be misdetected as a raw URL value and stringified to `"[object Object]"`. The same fix applies to `HttpService.request(config)`'s equivalent overload detection: a missing `url` key alone no longer means "this is a URL", matching axios' own `Axios.prototype.request` (`typeof configOrUrl === 'string'`). A `UrlObject` passed directly as `request(url, options)`'s first argument (this library's own extension over axios) is still recognised correctly, structurally.
  - **Fix: `axiosRef.create(config)` / a runtime `axiosRef.defaults.X = ...` assignment now apply `auth`, `maxContentLength`, `maxBodyLength`, `timeoutErrorMessage`, `decompress`, `socketPath`, `allowAbsoluteUrls` and `beforeRedirect`.** These 8 options used to be read only off module (`HttpModule.register()`) options, never off `axiosRef.defaults` - so `axiosRef.create({ auth })` sent no credentials, and `create({ maxContentLength })` (or a later `axiosRef.defaults.maxContentLength = ...`) enforced nothing. Precedence is now request config > `axiosRef.defaults` > module options, the same rule every other passthrough default already followed. See [Precedence: `axiosRef.defaults`](https://github.com/yordan-kanchelov/nestjs-axios-undici/blob/main/docs/axios-supported-options.md#precedence-axiosrefdefaults) for the full list and for which axios options are deliberately _not_ part of this merge surface (`httpAgent`/`httpsAgent`/`proxy`/`httpVersion`/`cookieJar`, resolved into this `HttpService`'s dispatcher once at construction; `signal`, not mergeable in axios either).

- 3480da8: Fixes the four remaining gaps found by the upstream conformance suites (plan.md phase 2): `data:` URLs, streamed `maxContentLength`, header sanitization, and a few remaining error-shape mismatches.

  - **`data:` URLs are now supported** (`axiosRef.get('data:text/plain;base64,...')`), resolved entirely locally like axios - no network request. Previously rejected with `Unsupported protocol data:`. Matches axios 1.20's `fromDataURI`/`estimateDataURLBufferAllocation` exactly: `maxContentLength` is checked against the same Buffer-allocation estimate Node's own base64 decoder would use, without allocating it; a non-`GET` method resolves a synthetic `405` (then subject to `validateStatus` like any other response); the decoded body is shaped per `responseType` (`Buffer` by default/`arraybuffer`, a real `Blob` for `blob` when the platform's global `Blob` exists, a UTF-8 string for `text`, a one-shot `Readable` for `stream`).
  - **`maxContentLength` is now also enforced for `responseType: 'stream'`.** It used to only apply to a buffered response, so a streamed download had no cap at all - a real DoS-relevant gap. Enforced against the _decoded_ (decompressed) byte count, matching axios' own streamed enforcement; destroys the stream with a real `AxiosError` (`ERR_BAD_RESPONSE`, "maxContentLength size of N exceeded") once crossed. Zero cost when `maxContentLength` is unset/`-1`.
  - **Fixed a socket leak on a compressed `responseType: 'stream'` response** (found in review): destroying the decompressed stream - whether because `maxContentLength` just crossed the limit above, or because a consumer simply stopped reading a compressed stream early with no limit involved at all - used to leave the raw undici response body/socket behind it dangling, since `.pipe()` never propagates destruction back to its source. Both now destroy the raw body too.
  - **Header values with CRLF or another control character, or a character outside the Latin-1 byte range, are now sanitized like axios**, not rejected. Previously undici's own, stricter validation threw `InvalidArgumentError` for input Node's own `http` module (axios' transport) silently rewrites instead; this library now strips the same characters (and trims a leading/trailing space/tab) before ever handing the value to undici, so both libraries send the same bytes on the wire.
  - **An unparsable `timeout` now gives `ERR_BAD_OPTION_VALUE`**, "error trying to parse `config.timeout` to int" - same code/message as axios, checked up front before ever dispatching. Previously gave the generic `ERR_BAD_REQUEST` a raw undici argument-validation error mapped to.
  - **A throwing `paramsSerializer` (or another synchronous config-normalization error building the request URL) now rejects as a proper `AxiosError`** (`ERR_BAD_REQUEST`, `isAxiosError: true`, `config` set), matching axios' own `buildURL(...)` try/catch in its http adapter - previously propagated the raw thrown error unwrapped.

  **Not changed:** a literal port of axios' own "append the caller's stack on error" mechanism (`Axios.prototype.request`'s `catch` block) was tried and reverted - see the doc comment on `HttpService.dispatch` (`src/modules/http/services/http.service.ts`) for the measured perf cost (40%+ CPU/req on an all-error workload, even with `Error.stackTraceLimit` capped at 1) and why it brings much less benefit here than in axios (this library's request path is an RxJS `Observable`, which doesn't carry V8's async-stack-trace link back to the application's call site the way axios' own plain `await`/`.then()` chain does). This library's existing errors already keep a meaningful stack at no extra cost: an interceptor's own thrown error is never wrapped, so it keeps the caller's own stack; every HTTP-originated error is built via `new AxiosError(...)`/`AxiosError.from(...)`, which already carries a stack from its own construction site.

  See [Request config](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=request-config) and [Errors](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=errors) for the details.

- 45adbd7: `withCredentials` is now a no-op, matching axios itself on Node.js; cookie handling is opt-in through an explicit `cookieJar` module option instead.

  **BREAKING:** `withCredentials: true` used to turn on a single cookie jar shared by the whole `HttpService` - a `Set-Cookie` from one caller's upstream response could be replayed on a different caller's later request (a real leak risk in a server handling multiple users). `withCredentials` is still accepted (and stays in the types, for axios compatibility), but no longer does anything.

  To keep cookie handling, pass a `tough-cookie` `CookieJar` instance explicitly:

  ```typescript
  import { CookieJar } from 'tough-cookie';

  HttpModule.register({ cookieJar: new CookieJar() });
  ```

  - Only a jar **instance** is accepted, never `true`: a shorthand that built one jar per service would just reintroduce the same shared-jar leak with a different trigger, so the caller owns the jar's scope explicitly (one per module, shared on purpose across modules by passing the same instance, or a fresh one per request/user if you manage that yourself).
  - Module-level only - there's no per-request `cookieJar`. Wiring one up builds an `http-cookie-agent` `CookieAgent` (wrapping whatever dispatcher the module built from `httpAgent`/`httpsAgent`/`proxy`/`socketPath`), which happens once per `HttpService`, never on the request path.
  - `http-cookie-agent` and `tough-cookie` moved from regular `dependencies` to **optional** peer dependencies (`peerDependenciesMeta.optional`), loaded lazily only when `cookieJar` is actually set. Requiring both unconditionally cost about 100-150ms at startup; a project that never uses `cookieJar` now pays nothing for them and doesn't need to install them. Install both (`npm i http-cookie-agent tough-cookie`) to use `cookieJar` - setting it without them throws a clear error at module setup instead of a bare `Cannot find module`.

  See [Cookies: `cookieJar`](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=cookies-cookiejar) for the full details.

- 238718c: Requests now send axios' default headers:

  - `Accept: application/json, text/plain, */*`.
  - `User-Agent: nestjs-axios-undici/<version>` (axios sends `axios/<version>`). Override it the axios way, `httpService.axiosRef.defaults.headers.common['User-Agent'] = '...'`, or through module/per-request headers.
  - `Accept-Encoding: gzip, deflate, br`, only when decompression is enabled (unlike axios, `compress` isn't advertised since neither library decodes it). A module-level `decompress: false` omits the header entirely.
  - A POST/PUT/PATCH with no body still gets the default `Content-Type: application/x-www-form-urlencoded`, matching axios; a `Blob` body's own `type` is now used as its `Content-Type` instead of that default.

  The defaults are seeded into `axiosRef.defaults.headers.common`, so they can be read and changed at runtime the axios way. Module `headers` (`register()`/`registerAsync()`) and per-request `headers` override them case-insensitively, and a header explicitly set to `undefined`/`null` removes a default, as in axios.

  **Precedence change:** module `headers` now take precedence over `axiosRef.defaults.headers`, for any header both set, not only the new built-in defaults. Before, a header set at runtime through `axiosRef.defaults.headers.common[...]` won over the same header from `register({ headers })`. To change a header at runtime, set it in `axiosRef.defaults` and leave it out of the module `headers`, or set it per request.

  `register({ headers: { common: {...}, post: {...} } })` now flattens axios' method-keyed header shape per method at setup, instead of sending literal `common`/`post` headers.

- e65bf43: Every `HttpService` now owns its own undici dispatcher end to end, and closes what it creates on shutdown (checked against real axios 1.20 semantics where relevant).

  **BREAKING: per-service default dispatcher, no more falling back to undici's global dispatcher.** Each `HttpService` builds its own undici `Agent` once, at construction (`allowH2: false` unless `httpVersion: 2`, which already builds its own dispatcher and wins over this default), from this package's own undici copy - not from `undici.getGlobalDispatcher()`. Precedence, highest first: a per-request `dispatcher` > a per-request `socketPath` > the module's own dispatcher (an explicit module `dispatcher`, or one built from `httpAgent`/`httpsAgent`/`socketPath`/`proxy`/env-proxy/`httpVersion`/`cookieJar`) > this per-service default. `undici.setGlobalDispatcher()` elsewhere in the process has **no effect** on requests made through `HttpService` any more. This also fixes the "two copies of undici" case (a Node.js version bundling its own undici could previously own the global dispatcher, so a plain request silently ran on a completely different connection pool than the one this library's own undici copy manages) and undici 8's default HTTP/2 negotiation on the no-transport-options path (this default is always built with `allowH2: false`).

  **BREAKING: `HttpService` implements `OnModuleDestroy`.** `app.close()` (or `moduleRef.close()` in a test) now gracefully closes (`Dispatcher#close()`, not `destroy()` - lets in-flight requests finish) every dispatcher this library created for that service: the per-service default `Agent`, the module-built dispatcher (whichever of `Agent`/`ProxyAgent`/`EnvHttpProxyAgent`/`CookieAgent` was built), and every cached per-path `socketPath` `Agent`. A `dispatcher` you supplied yourself - through module options, a per-request option, or `setDispatcher()` - is never closed by this library. Previously, none of these were ever closed, so a real app that called `app.close()` could still see a lingering open connection afterwards.

  **BREAKING: the static `HttpModule` import (no `register()` call) no longer shares one options object across every app that imports it.** The default options are now built by a factory instead of one shared `{}` literal, so each app's `HttpService` gets its own - previously, `setDispatcher()`/the old `setGlobalDispatcher()` (or anything else mutating the shared object) in one app leaked into every other app's `HttpService` that also imported the bare `HttpModule`.

  **BREAKING: `HttpService` member cleanup**, per the "breaking changes are fine before 1.0.0" decision:

  - **`setGlobalDispatcher` is renamed to `setDispatcher`, with no alias.** It never touched undici's own global dispatcher - only this service - so the old name was misleading either way. If the dispatcher it replaces is one this service created itself (the module-built dispatcher, or the per-service default when nothing else was configured), that dispatcher is now closed; a dispatcher you supplied yourself is never closed.
  - **`setInterceptors()` is no longer public.** It existed only for `HttpModule.register()`/`.registerAsync()` to hand the fully-resolved interceptor list to a freshly-constructed `HttpService`; that now happens through the constructor instead. Use `addInterceptor()` at runtime, or the module's `interceptors` option at setup.
  - **`interceptorCount` is now the real count of the module-registered (`addInterceptor()`/module `interceptors`) chain only.** It used to add 1 for a phantom "axios response adapter" interceptor that hasn't existed since the axiosRef pipeline refactor, and separately counted `axiosRef`'s own request/response interceptors (a different chain, with no equivalent count on real axios either).
  - **`undiciRef` now returns a read-only, frozen snapshot** (a fresh copy on every read, internal `__`-prefixed keys stripped), not the live, mutable options object. Mutating it already had no effect on `axiosRef.defaults`-backed fields (headers, timeout, ...); it's read-only for the rest too now.

  **Fix: axios-only keys no longer leak into undici's per-request dispatch options.** `auth`, `httpAgent`, `httpsAgent`, `proxy`, `httpVersion`, `cookieJar`, `withCredentials`, `xsrfCookieName`/`xsrfHeaderName` and the internal `__`-prefixed keys used to be spread wholesale onto every request (harmlessly ignored by undici itself, but visible to anything inspecting the options, such as a custom `Dispatcher`). They're stripped once, at setup, instead of being carried on every request.

  **Fix: axios compatibility warnings are now logged through Nest's own `Logger`** (context `HttpModule`), not `console.warn`.

  See the [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide?id=dispatcher-lifecycle-and-httpservice-members) for the full list.

  **Tests using undici's `MockAgent` with `setGlobalDispatcher(mockAgent)` must change.** The mock no longer intercepts `HttpService` requests; they reach the real network. Pass it as `HttpModule.register({ dispatcher: mockAgent })` or call `httpService.setDispatcher(mockAgent)`.

- bb8d7a1: Errors, timeouts and size limits now match axios (checked against real axios 1.20 and its `follow-redirects` transport), and cover several fewer gaps than before.

  **BREAKING: `timeout` is now a total (deadline) timeout, like axios, not an idle timeout.** Previously `timeout` only mapped to undici's `headersTimeout`/`bodyTimeout`, which reset on every chunk - a response body that trickled in slowly (or arrived just as the idle timer was about to fire) never timed out at all. `timeout` is now enforced from the moment the request starts until the response body is fully read (or, for `responseType: 'stream'`, until the response headers arrive - matching axios there too), with one timer per request, created only when `timeout > 0`. undici's own `headersTimeout`/`bodyTimeout` are still set alongside it, as a backstop. If your code relied on a slow-but-steady response never triggering `timeout`, it now will, at the configured value.

  **BREAKING: size-limit error codes changed to match axios exactly.**

  - `maxContentLength` exceeded now rejects with `ERR_BAD_RESPONSE` (was `ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED`), enforced against the _decompressed_ size as bytes arrive - for a compressed response, the decompression itself is streamed and checked chunk by chunk (destroying both the compressed and decompression streams the moment the limit is crossed), so a small, highly compressible body ("gzip bomb") can't fully decompress in memory before being rejected.
  - `maxBodyLength` is now actually enforced (previously silently ignored for most requests). A string/Buffer body over the limit rejects synchronously with `ERR_BAD_REQUEST`, "Request body larger than maxBodyLength limit" (axios checks this before ever dispatching). A stream body over the limit rejects as bytes are written, with `ERR_FR_MAX_BODY_LENGTH_EXCEEDED` - the code axios' own default (redirect-following) transport uses for this case.
  - A module-level `maxContentLength`/`maxBodyLength` no longer overrides a per-request value - the more specific (per-request) value now wins, as in axios.
  - The `SizeLimitInterceptor` (`createSizeLimitInterceptor`) is no longer registered automatically from `HttpModule.register({ maxBodyLength, maxContentLength })` (it used the old, wrong codes and buffered the whole response first); its own codes/messages were also updated to match axios, for anyone still using it directly.

  **Other fixes:**

  - Errors undici throws synchronously for a request this library can't send are now proper `AxiosError`s with `config`/`request` set, instead of a raw undici error class: an unsupported URL protocol (`tel:`, `ftp:`, ...) now gives axios' own `Unsupported protocol ${protocol}` (`ERR_BAD_REQUEST`), and undici's own argument-validation failures (an invalid header value, method, ...) get `ERR_BAD_REQUEST` instead of undici's raw code. A genuinely malformed URL (one `new URL()` itself rejects) still propagates unwrapped, matching `@nestjs/axios`.
  - `error.request`/`response.request` are populated (`path`, `method`, `host`, `protocol`, and `res.responseUrl` - the final hop's URL, whether or not a redirect was followed), instead of a useless empty placeholder - matching the fields axios' own callers commonly read. Still not set for an error where axios itself never builds a request object either (an already-canceled signal, an unsupported protocol).
  - `timeoutErrorMessage` and `transitional.clarifyTimeoutError` (code `ETIMEDOUT` instead of `ECONNABORTED`) are now honoured.
  - `validateStatus: null` (or `undefined` set as an explicit key) now means every status resolves, as in axios; previously it fell back to the default 2xx range.
  - Credentials embedded in a URL (`http://user:pass@host`) now become `Authorization: Basic ...`, as in axios, and are stripped from the request line/Host header; `config.auth` still wins when both are set.
  - `allowAbsoluteUrls: false` (axios >=1.8) is now honoured: with a `baseURL`, an absolute request `url` is combined with it anyway (naive concatenation), instead of replacing it outright.
  - Fixed two PR #15 review follow-ups: `resolveSignal` no longer leaves a listener on a long-lived caller `signal` when combined with a legacy `cancelToken`; `toAxiosError` now reads the actual per-request abort signal instead of the caller's pre-merge one, so cancellation-vs-timeout detection no longer depends on the `AbortError`/`UND_ERR_ABORTED` fallback working out.
  - `AxiosError.prototype.toJSON()` now matches axios' key set exactly (added the browser-only fields, always `undefined` on Node, that axios itself includes) and serialises `config.headers` as a plain object when it's an `AxiosHeaders` instance.

  **Known remaining gaps** (documented in the differential test suite, not fixed): a query-string apostrophe (`'`) always comes out `%27` (undici always dispatches through a WHATWG `new URL()` parse, which percent-encodes it for `http(s)` regardless of what string this library hands it - axios' own encoder leaves it as-is); undici rejects a header value with an embedded `\n` where Node's own `http` module (what axios uses) silently strips it; a timeout that lands after the response has already started streaming gives `ECONNABORTED`/"timeout of Nms exceeded" here, where axios' own internal race can instead give `ERR_BAD_RESPONSE`/"stream has been aborted" (depends on whether axios' own response object happens to exist yet when its timeout fires).

  See [Errors](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=errors) and the [error-handling guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/error-handling) for the full details.

- 9039797: Response bodies now decode like axios:

  - `+json` content types (`application/problem+json`, `application/vnd.api+json`, `application/hal+json`, ...) are parsed as JSON, not returned as a `Buffer`.
  - Responses with no `Content-Type`, or `text/*`, `application/xml`, `application/javascript`, `application/x-www-form-urlencoded`, `image/svg+xml` or `application/octet-stream`, decode to a UTF-8 string; a JSON-looking string is parsed and silently falls back to the string on failure, matching axios' `forcedJSONParsing`/`silentJSONParsing`. Other binary content types are unaffected and still come back as a `Buffer`.
  - `responseType: 'blob'` now returns a string, matching axios in Node.js (which has no native `Blob` decoding there); use `responseType: 'arraybuffer'` for binary downloads.
  - Responses with `Content-Encoding: gzip`, `br` or `deflate` are decompressed automatically. Set `decompress: false` (per request or in `register()`) to get the raw compressed body, as in axios.
  - `statusText` is now the server's actual reason phrase instead of always coming from a static table.

- b66f605: Transport options (`httpsAgent`/`httpAgent`, `socketPath`, proxy, `httpVersion`) now work as they do in axios:

  - **TLS.** A module-level `httpsAgent`'s TLS options - `ca`, `cert`, `key`, `pfx`, `passphrase`, `rejectUnauthorized`, `servername`, `ciphers`, `minVersion`, `maxVersion` - are mapped onto undici's `Agent({ connect: {...} })`. `httpAgent`/`httpsAgent`'s `keepAlive` (→ `pipelining`) and `maxSockets` (→ `connections`) now work correctly too (`keepAlive` mapping was previously a no-op). Module-level only; a per-request `httpAgent`/`httpsAgent` is still ignored.
  - **`socketPath`** now actually works, at module and request level: `Agent({ connect: { socketPath } })`, cached per path. It used to be silently ignored (a plain request went to TCP `127.0.0.1:80`) or, combined with other axios options, threw `Invalid URL protocol`. The request URL's host is still used only for the `Host` header, matching axios.
  - **Proxy environment variables.** `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (case-insensitive) are now read at module setup, matching axios' default (`proxy-from-env`), via undici's `EnvHttpProxyAgent` - **only** when no `dispatcher`, `proxy` or `socketPath` is configured. As in axios, a custom `httpAgent`/`httpsAgent` doesn't turn this off; its TLS options still apply, including to targets reached through the proxy. `proxy: false` opts out entirely, as in axios.

    **Behaviour change:** earlier versions never read these variables. If your environment sets `HTTP_PROXY`/`HTTPS_PROXY` (common on some CI runners and corporate networks), requests now go through that proxy by default - including to `localhost`/`127.0.0.1`, unless `NO_PROXY` covers it. Pass `proxy: false` if you don't want that.

  - **HTTP/2 opt-in.** `httpVersion: 2` maps to `Agent({ allowH2: true })` at module level (needs a target that speaks HTTP/2 over TLS; undici has no plaintext HTTP/2).
  - **Precedence.** An explicit `dispatcher` (module- or request-level) always wins over all of the above - none of this mapping runs once one is set.

  Also removed: the dead `__axiosCompat.baseURL` code path (baseURL was already applied correctly elsewhere; this one broke on a `UrlObject` URL) and the `unix:`-prefixed URL rewrite `socketPath` used to attempt.

- 978443a: Requests now follow redirects by default, like axios: up to 21 redirects (`maxRedirects`, unset), matching follow-redirects/axios exactly - 301/302 turn `POST` into `GET` and drop the body, 303 turns anything but `HEAD` into `GET` and drops the body, 307/308 keep the method and body, `Authorization`/`Cookie`/`Proxy-Authorization` are dropped across a protocol downgrade or a host (including port) change, and exceeding the limit rejects with `ERR_FR_TOO_MANY_REDIRECTS` ("Maximum number of redirects exceeded", no `response`, same as axios).

  To opt out and get the previous behaviour (the 3xx response returned as-is, subject to `validateStatus` like any other status), set `maxRedirects: 0` per request or at module level (`HttpModule.register({ maxRedirects: 0 })`).

  Also new: the axios `beforeRedirect(options, responseDetails, requestDetails)` option, at request and module level, and `response.request.res.responseUrl` (the final hop's URL) once a redirect was followed.

  A request body that's a Node.js stream (not a `Buffer`/string/`FormData`) can't be resent on a redirect that keeps it (307/308, or a non-POST 301/302) - that now rejects clearly with `ERR_FR_REDIRECTION_FAILURE` instead of sending a broken request. Buffer the body yourself first if you need it to survive a redirect, or set `maxRedirects: 0` and follow it manually.

  Redirects are handled manually on the response (a 3xx status + `Location` check) rather than by composing undici's own redirect interceptor onto every request, so a non-redirecting response's cost is unchanged.

  `timeout` covers the whole redirect chain, as in axios, and `axiosRef.defaults.maxRedirects` is honoured.

- cecfbef: Duplicate response headers are now joined the way axios (running on Node's `http`) joins them, not left as undici's raw arrays.

  **BREAKING:** a header that a server sends more than once (e.g. two `X-Foo:` lines) used to come back on `response.headers` as a `string[]`. It now matches Node's `IncomingMessage.headers` getter exactly:

  - `set-cookie` is still always an array.
  - `cookie` joins repeats with `'; '`.
  - A fixed set of "no duplicates" headers (`content-type`, `content-length`, `user-agent`, `referer`, `host`, `authorization`, `proxy-authorization`, `if-modified-since`, `if-unmodified-since`, `from`, `location`, `max-forwards`, `retry-after`, `etag`, `last-modified`, `server`, `age`, `expires`) keep only the first value and silently drop the rest.
  - Every other header (including any custom one) joins repeats with `', '`.

  Code that read a duplicated header expecting an array (other than `set-cookie`) now gets a string instead. This also fixes a latent crash: a duplicated `Content-Type` used to reach `String.prototype.trim()` as an array and throw; it's now read the same singleton way axios reads it.

- b6f1d35: `onUploadProgress`/`onDownloadProgress`, `maxRate` and `formSerializer` are now supported (plan.md phase 2, the last item before docs).

  **Progress callbacks and `maxRate`:**

  - `onDownloadProgress`/`onUploadProgress` fire with axios' own `AxiosProgressEvent` shape (`loaded`, `total`, `progress`, `bytes`, `rate`, `estimated`, `lengthComputable`, `upload`/`download`), throttled the way axios throttles it (at most every ~333ms, plus a final flush so the last event always reflects the true final state). `onDownloadProgress` works with every `responseType`, including `'stream'`. `onUploadProgress` works for a string, `Buffer`, stream, or `FormData`/`postForm` body - a `postForm`/multipart body doesn't have a known `total` (this library doesn't pre-compute the encoded multipart size the way axios' own `formDataToStream` does), so `total`/`progress` stay `undefined` there even though `loaded` still tracks real bytes written.
  - `maxRate` (a number, or `[upload, download]`) throttles actual throughput in both directions, via the same windowed-chunk-splitting algorithm axios' `AxiosTransformStream` uses.
  - All three work at request level, through `axiosRef.defaults`, and through `HttpModule.register()`/`.registerAsync()` options (seeded into `axiosRef.defaults` once at setup, like every other passthrough default) - request config always wins.
  - A request that sets none of these pays no measurable extra cost: the request/response body is only ever wrapped in a counting/throttling stream when at least one is actually configured.

  **`formSerializer`:**

  - Axios' own options for turning a plain object/array into `FormData`/a url-encoded body (`{ visitor, dots, metaTokens, indexes, maxDepth }`, ported from `lib/helpers/toFormData.js`) are now honoured by `postForm`/`putForm`/`patchForm`, and by a plain request whose `Content-Type` is explicitly `application/x-www-form-urlencoded` or `multipart/form-data`. Defaults match axios exactly (`dots: false`, `metaTokens: true`, `indexes: false`, `maxDepth: 100`); a custom `visitor` replaces the default traversal entirely. With no `formSerializer` set, behaviour and cost are unchanged.
  - The reverse also works: a real `FormData` sent as `data` with an explicit `Content-Type: application/json` is converted to a plain object first (axios' `formDataToJSON`) and then `JSON.stringify`d, instead of being encoded as multipart - matching axios' default `transformRequest`.

  **Types:** `HttpModuleOptions`, `AxiosLikeRequestConfig` and `AxiosRefDefaults` all gained `onUploadProgress`/`onDownloadProgress`/`maxRate`/`formSerializer`. New exported types: `AxiosProgressEvent`, `FormSerializerOptions`, `SerializerVisitor`, `FormDataVisitorHelpers`, `FormDataLikeTarget` - matching axios' own type names field-for-field, including `SerializerVisitor`'s `path: Array<string | number> | null` (no `undefined`) so a callback written against axios' own types is mutually assignable.

  Not implemented: `formDataHeaderPolicy` (a `form-data`-package-specific option, not part of `formSerializer` itself) and pre-computing a `Content-Length` for a multipart upload (see the `onUploadProgress` note above) - both documented in `docs/axios-supported-options.md`.

- c24e242: axiosRef request/response interceptors now run over one axios-shaped config object, carried through to `response.config`/`error.config`, matching axios:

  - **Config shape.** Interceptors, `response.config` and `error.config` now see: raw (unserialised) `data`; `params` and `baseURL` as given (not merged into `url`); `url` as given (not combined with `baseURL`); a lower-case `method`; `headers` as `AxiosHeaders` (with `set`/`setAuthorization`/`setContentType` working); and any custom field set on the config (for example a `_retry` flag) survives a round trip through `error.config`. Before, `response.config`/`error.config` were rebuilt separately with the serialized body, the full combined URL, an upper-case method and no custom fields - so a "retry once on 401" interceptor (`if (!cfg._retry) { cfg._retry = true; return axiosRef.request(cfg) }`) looped forever, replaying a POST through `error.config` sent an empty body, and packages built on this pattern (`axios-retry`, `axios-auth-refresh`) didn't work.
  - **Interceptor order changed to match axios**: request interceptors now run last-registered-first (LIFO), response interceptors first-registered-first (FIFO) - both were the other way round before.
  - `runWhen` and `synchronous` (the 3rd argument to `interceptors.<request|response>.use()`) are now honoured; `runWhen` is evaluated once per request, against the config as built, before any interceptor has run - as in axios.
  - **`transformRequest`/`transformResponse`** (module- and request-level) now run against the raw request data / raw response body, replacing default serialisation/parsing entirely when set - matching axios. Before, module-level transforms ran through a generic interceptor that only ever saw the already-serialised undici body (for requests) or the already-parsed value (for responses), and per-request transforms were silently ignored.
  - `HttpService.interceptorCount` now also counts live axiosRef request/response interceptors (it previously only counted module-registered ones, since axiosRef interceptors no longer share that internal list).
  - Fixed a pre-existing bug in `AxiosHeaders`: spreading an instance (`{ ...config.headers }`, a common pattern for adding a header in an interceptor) leaked its internal storage as an enumerable `headers` property, which undici then rejected as an invalid header value.
  - Added `AxiosHeaders#setAuthorization`, `#setContentType` and `#getContentType`.

  Requests with no axiosRef interceptors and no transforms keep the fast path; only `response.config`/`error.config` are built for them.

  `transformResponse` follows axios for binary and stream responses: it is skipped for `responseType: 'stream'` and receives the raw `Buffer` for `'arraybuffer'`.

- 9f35c2c: Request-side axios parity fixes: a numeric-string `timeout`, a throwing `beforeRedirect`, and a malformed request URL.

  - `timeout: '250'` (a numeric string) is now parsed the same way axios' own `parseInt(config.timeout, 10)` does and enforced exactly like `timeout: 250`. It used to reject with undici's raw `ERR_BAD_REQUEST`/"invalid headersTimeout" instead. An already-numeric `timeout` pays no extra cost.
  - A `beforeRedirect` callback that throws is now wrapped the way axios (`follow-redirects`) wraps it: `error.code` is `'ERR_FR_REDIRECTION_FAILURE'`, `error.message` is `"Redirected request failed: <original message>"`, and `error.cause` is the original error. It used to propagate the raw, unwrapped error with `code: undefined`.

  **BREAKING:** a request URL with an embedded null byte or other C0 control character, or a bare `\n` (e.g. `'\u0000https:example.com/users'`), used to be silently "fixed" (the offending characters stripped, matching how a WHATWG `new URL()` parse is forgiving about them for a special scheme like `http:`/`https:`) and actually dispatched over the network. It's now rejected synchronously, before ever dispatching, with `error.code === 'ERR_INVALID_URL'` and the message `Invalid URL "<url>": missing "//" after protocol` - the same axios (`buildFullPath`'s `assertValidHttpProtocolURL`) gives for the same input. Code that (knowingly or not) relied on such a URL being silently normalized and sent now gets a synchronous `AxiosError` instead.

- d07bd25: Response-side axios parity fixes, found triaging the axios upstream conformance suite's remaining "not yet root-caused" entries:

  - **`Content-Encoding: compress` / `x-compress`.** Decoded exactly like `gzip` (axios' own Node `http` transport aliases the name onto its gzip decoder too - it doesn't implement the old LZW `compress` scheme either), for both buffered and `responseType: 'stream'`, honouring `decompress`/`decompress: false` and the streamed `maxContentLength` check. The default `Accept-Encoding` request header now reads `gzip, compress, deflate, br`, matching axios' own default exactly (previously `gzip, deflate, br`).
  - **BREAKING: `Content-Encoding` is now deleted from `response.headers` after a successful decode**, matching axios exactly (`lib/adapters/http.js`): deleted only when `decompress !== false` and something was actually decoded (unconditionally for a `HEAD`/`204`, or when the encoding is one this library recognizes) - never for `decompress: false`, and never for an unrecognized encoding. A caller reading `response.headers['content-encoding']` after a normal, decoded response now sees `undefined`, where it used to still show the original (already-inaccurate) value. `content-length` is left untouched either way - axios doesn't touch it on decode.
  - **Corrupt (not merely truncated) compressed body → a real `AxiosError`.** A response body that fails to decode entirely (the wrong format, a bad header check) now rejects/errors with a proper `AxiosError` (`isAxiosError`, `.config`, `.request`, `.code` falling back to the raw zlib code such as `Z_DATA_ERROR`) instead of the raw, unwrapped zlib error - matching axios' own buffered-path shape (`AxiosError.from(err, null, config, lastRequest, response)`) for a buffered response, and extended to `responseType: 'stream'` too (the stream's own `'error'` event now carries it), which real axios itself leaves unwrapped for the stream case.
  - **Merely truncated (not corrupt) compressed bodies no longer throw at all.** Every decoder now uses axios' own flush-tolerant zlib options (`finishFlush: Z_SYNC_FLUSH`, `BROTLI_OPERATION_FLUSH`, `ZSTD_e_flush`), so an empty body, or one cut off mid-stream but with a structurally valid header, resolves with `''` (empty) or with whatever partial bytes could be decoded, instead of `Z_BUF_ERROR`/"unexpected end of file" - matching axios exactly, and fixing a real regression the axios upstream conformance suite caught during this work ("should not fail with an empty response (with|without) content-length header (Z_BUF_ERROR)").
  - **`transitional.silentJSONParsing: false`** (together with `responseType: 'json'`) now throws `ERR_BAD_RESPONSE` on invalid JSON, with `response.data` the raw (unparsed) text - matching axios' exact condition (`strictJSONParsing = !silentJSONParsing && responseType === 'json'`; every other `responseType`, including the plain default, is unaffected and stays silent, at no extra cost). Supported on per-request config, `axiosRef.defaults.transitional` and module options (`register({ transitional })`), with the usual request > `axiosRef.defaults` > module precedence.
  - **`responseType: 'stream'` cancellation.** A `'stream'` response is now cancelled with a real `CanceledError`/`ERR_CANCELED` in the two cases axios itself cancels it in: destroying the request's own upload body stream mid-request (previously surfaced undici's raw `AbortError`/`UND_ERR_ABORTED` unwrapped), and the caller's own `AbortSignal` firing _after_ the stream was already handed back (previously had no effect at all once the stream was emitted - the stream just kept flowing). Both are zero-cost when neither a signal nor a streamed upload body is in play. Unrelated to, and unaffected by, the already-documented "unsubscribing the Observable has no effect once the stream has been emitted" difference (that one has no `AbortSignal` of the caller's own involved).

  See `docs/axios-supported-options.md` and `docs/migration-guide.md` for the details of each.

- 93ffbc6: Fix: `HttpService.onModuleDestroy` no longer waits forever on an abandoned `responseType: 'stream'` response.

  `app.close()`/`onModuleDestroy` still closes every dispatcher this library created gracefully first (`Dispatcher#close()` - lets in-flight requests finish, exactly as before). Past a short internal grace period (a few seconds, not configurable, and unrelated to a request `timeout`), anything still open is force-aborted instead of left hanging shutdown indefinitely - in practice, this only ever matters for a `responseType: 'stream'` response that was never read and never `.destroy()`d, since every other response shape is always fully drained by this library itself. Every cached per-path `socketPath` `Agent` closes concurrently too, so several of them no longer add up to several times the grace period. A dispatcher you supplied yourself is still never touched here - you own its lifecycle.

  No public API change (the grace period is an internal constant, not an option).

- 5498f88: Strictly typed `HttpModuleOptions`, a single request-config type, and an optional `axios` peer for `instanceof` interop.

  **BREAKING:**

  - **`HttpModuleOptions` is strictly typed** - no more `& any` / `Partial<any>`. Every axios option this library maps (`baseURL`, `headers`, `params`, `paramsSerializer`, `auth`, `timeout`, `maxRedirects`, `beforeRedirect`, `validateStatus`, `responseType`, `decompress`, `maxContentLength`/`maxBodyLength`, `transformRequest`/`transformResponse`, `httpAgent`/`httpsAgent`, `proxy`, `socketPath`, `httpVersion`, `withCredentials`, `cookieJar`) and every undici option it passes through (`dispatcher`, `headersTimeout`/`bodyTimeout`, `pipelining`, `connections`, `maxRedirections`) is spelled out. A typo such as `register({ timeuot: 5 })` is now a compile error - it used to type-check silently. `HttpModule.register()`/`.registerAsync()` still accept `@nestjs/axios`' own `HttpModuleOptions`/`HttpModuleAsyncOptions` values directly.
  - **Removed types**, merged into `AxiosLikeRequestConfig<D = any>`: `AxiosCompatibleRequestOptions`, `AxiosCompatibleRequestConfig`, `HttpRequestOptions`. Anywhere you imported one of these three, use `AxiosLikeRequestConfig` instead. Also removed: `HttpServiceOverloads` (unused, unimplemented).
  - **`post`/`put`/`patch` gained a real body type parameter**: `post<T, D>(url, data?: D, config?: AxiosLikeRequestConfig<D>)`, matching `@nestjs/axios`. `data` is now checked against `D` instead of accepted as `any` - a call passing a body of the wrong shape, previously silently allowed, can now fail to compile.
  - **`response.headers`'s TypeScript type** changed from an `IncomingHttpHeaders`-based type to `Record<string, any>` (still a plain object at runtime - see below). `AxiosLikeResponse<T, D>` and axiosRef's `InternalAxiosLikeRequestConfig<D>` (used for `response.config`/`error.config` and axiosRef interceptor configs) are now structurally assignable to/from axios' own `AxiosResponse<T, D>` / `InternalAxiosRequestConfig<D>` for the common cases: a function declared `(): Observable<AxiosResponse<T>>` compiles when it returns this library's `HttpService.get()`, a unit-test mock `of({...} as AxiosResponse)` is assignable to `HttpService['get']`'s return type, and axiosRef request interceptor configs have a non-optional `headers`, so `config.headers['Authorization'] = ...` and `config.headers.set(...)` (the README's own example) type-check under `strict` without a null check.
  - **`error instanceof AxiosError` also holds for `axios.AxiosError`** when the optional `axios` peer is installed (`npm i axios`; `axios` is not a runtime dependency of this package - requests never go through it). This package's `AxiosError` links its prototype onto axios' own, lazily, at module load. `error instanceof axios.CanceledError` specifically does **not** hold (a prototype chain is linear - see the doc comment on `linkOptionalAxiosPeer` in `axios-error.ts`); use `isCancel()` (from either package, duck-typed) to detect cancellation. The link is made to the copy of `axios` this package resolves; if your app ends up with a second, separate copy of `axios`, `instanceof` against that copy won't hold (use `axios.isAxiosError()`, which is duck-typed).
  - **`HttpModule.registerAsync({})`** (none of `useFactory`/`useClass`/`useExisting` set) now throws `HttpModule.registerAsync() requires one of useFactory, useClass or useExisting` at setup, instead of silently registering a provider with `provide: undefined`.
  - **`AxiosHeaders` gained methods** (purely additive): `concat`, `toString`, `normalize` (a no-op: names are stored lower-cased, so `normalize(true)` doesn't title-case them as axios does), `getSetCookie`, and the `get`/`set`/`has` shorthand accessors (`ContentType`, `ContentLength`, `Accept`, `AcceptEncoding`, `ContentEncoding`, `UserAgent`, `Authorization`).
  - **`strict` TypeScript is now on for the published build** (`tsconfig.build.json`); the package's own `.d.ts` output is unaffected either way for consumers, but contributors building from source now get the stricter checks.

  **Not changed:** `response.headers` stays a plain object at runtime, not an `AxiosHeaders` instance - measured (this library's `AxiosHeaders`, a typical response's headers, 200k iterations) at about 955ns more per response just to construct, before the Proxy-trap cost on every later read; not worth it unconditionally against the CI regression check's `+10%` CPU-per-request budget. `response.headers.get(...)` etc. stay unavailable; index by string key as before.

  Full details: [`docs/axios-supported-options.md`](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options?id=types) ("Types" section) and the [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide?id=types) ("Types" under "Upgrading from 0.6.x").

- 6fb4c8a: Fixed a bug where `maxRate`/`onDownloadProgress` on a buffered download (every `responseType` except `'stream'`, with a known `Content-Length` within `maxContentLength`) could fail with `UND_ERR_SOCKET`/"other side closed" even though the full response body had actually been delivered, against a server with a short `keepAliveTimeout` (Node's own default is 5s). Root cause: an undici h1-client bug (see `plan/reports/undici-slow-consumer.md`) where throttling/backpressuring the response body left undici's parser paused for long enough that the server's keep-alive timeout could race the parser's own message-completion handling. Fixed for a buffered response by draining the raw response as fast as undici delivers it (bounded by the response's own `Content-Length`, so no worse than what that response already holds in memory regardless of `maxRate`) and only pacing the _output_ side that `maxRate`/`onDownloadProgress` actually throttles; a belt-and-suspenders check, for every `responseType` including `'stream'`, also turns an already-fully-delivered body's `UND_ERR_SOCKET` into a normal end, for the rare case the race still occurs.

  `responseType: 'stream'` is **not** covered by the eager-drain fix, even with `maxRate`/`onDownloadProgress` set - doing so would mean buffering a potentially huge streamed download in memory ahead of time, defeating the point of streaming - nor is a chunked/unknown-length response, or a response whose `Content-Length` already exceeds `maxContentLength`. All three remain exposed to the underlying undici bug - documented as a known limitation, with a workaround, in `docs/axios-supported-options.md` and `docs/migration-guide.md`.

  Also fixed: aborting a metered, buffered download (or its `timeout` elapsing) while the caller's own promise was still pending now always rejects (`ERR_CANCELED`/a timeout error), even once the eager drain above has already finished reading the raw response - previously the underlying transport had nothing left to abort by that point, and the request could silently resolve successfully instead.

- 55cdfc5: Unsubscribing from a request Observable before it emits (rxjs `timeout()`, `switchMap`, `takeUntil`, `race`, ...) now aborts the in-flight undici request, matching `@nestjs/axios`' `makeObservable`. The abort is skipped once the response has been emitted, or, for `responseType: 'stream'`, once the headers have arrived.

  `axiosRef` request interceptors now run fresh on every subscription instead of once when `get()`/`post()`/... is called, so `get().pipe(retry())` sends a new set of headers on each attempt instead of replaying the first one. `HttpService` methods already returned cold Observables; they still do no work before subscribe.

### Patch Changes

- 8dd0013: Lower CPU per request by building `response.config` and `error.config` only when read. Both used to build a full axios-shaped config object, including an `AxiosHeaders` instance, on every request and every error. The fields `config` shows are still copied when the response or error is created, so later changes to the request object don't show up in it. `config` is still an own, enumerable property, so `{ ...response }` and `JSON.stringify` keep it.
- 0bd57b4: Require Node.js 22.17 or later (`engines.node` was `>=22.12.0`). On Node.js 22.12-22.16, an ESM app on NestJS 12 that imports this package can fail to start (`ReferenceError: Cannot access 'isUndefined' before initialization` from `@nestjs/common`, an issue with Node.js loading the ESM-only NestJS 12 from a CommonJS package). Node.js 22.17+ works with every supported NestJS and `undici` 7 version; `undici` 8 itself requires Node.js 22.19+.

## 0.6.1

### Patch Changes

- b6cad17: Declare `@nestjs/core` as a peer dependency. `HttpModule` imports `ModuleRef` from it, so the package failed to load when `@nestjs/core` wasn't installed.

## 0.6.0

First release as `nestjs-axios-undici` (previously published as `nestjs-undici-interceptors`). The API is the same; change the import path. See the [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide?id=coming-from-nestjs-undici-interceptors).

### Features

- `@nestjs/axios` compatibility, verified side by side with real `@nestjs/axios` in a 65-test compatibility matrix: `request(config)`, `axiosRef.defaults` and promise methods (`axiosRef.get()` ...), interceptor `eject`/`clear`, `params`/`paramsSerializer`, axios `baseURL` joining, `responseType`, `signal` and `cancelToken`, per-request `auth` and `maxRedirects`, and `registerAsync` applying the same option mapping as `register`.
- Axios-compatible errors for every failure: `isAxiosError()` is true for status, network, timeout and cancellation errors, with axios `code` values (`ERR_BAD_REQUEST`, `ERR_BAD_RESPONSE`, `ECONNABORTED`, `ERR_CANCELED`, `ECONNREFUSED`, ...). `AxiosError`, `CanceledError`, `isAxiosError` and `isCancel` are exported.
- `maxRedirects` works on undici 7.x through the undici redirect interceptor.

### Performance

- Responses are converted to the axios format directly at the end of the request instead of through an extra interceptor layer, and the package is compiled to ES2020 (native async/await). HttpService throughput is 28-32% higher in the micro-benchmark.

### Behaviour changes

- Network, timeout and cancellation errors are wrapped in `AxiosError`; the original undici error is available as `error.cause`.
- String and `Buffer` request bodies default to `Content-Type: application/x-www-form-urlencoded`, as in axios.
- Per-request headers are merged with module headers instead of replacing them.
- Module-level `timeout`, `auth`, `params` and `maxRedirects` apply to every request.
- Supported: Node.js 22.12 or newer (tested on Node.js 22, 24 and 26), `@nestjs/common` 10, 11 or 12, `rxjs` 7 and `undici` 7 or 8. Older versions of these never worked with this code and are no longer listed as supported.
- The package has an `exports` map: only the package root can be imported.

### Fixes

- Class interceptors passed to `registerAsync()` are instantiated, with dependencies from the module's `imports` and `extraProviders` (they failed at request time before). Interceptor instances are accepted by `register()` and `registerAsync()` (they were dropped).
- `maxRedirects` works when another copy of undici is the global dispatcher, such as the one bundled with Node.js 22 after something reads the global `fetch` first (it failed with `invalid onError method`).
- `HttpModuleOptions` and the other module option types are exported.
- `tough-cookie` is a runtime dependency (it was only a devDependency, which broke installs without automatic peer dependencies).

### Project

- Benchmarks (k6 + Docker across Node.js 22, 24 and 26, and a pull-request regression check) live in `benchmarks/` and run against the library code of each commit. Results: [benchmarks](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/benchmarks).
- Merged upstream `nestjs-undici` v0.2.60.
