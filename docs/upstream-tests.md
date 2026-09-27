# Upstream test results

Every pull request that touches `src/` runs the test files of `@nestjs/axios` and axios against this package, unmodified. The same suites also run on every push to `main` and once a week. A test that doesn't pass is listed as an expected failure, with a written reason. The run fails if a test outside those lists fails, or if a listed test starts passing and the list goes stale.

This page explains each expected failure. The full lists, with one reason per test, are in [`tests/upstream/`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/tests/upstream). [Testing](/docs/guides/testing.md#upstream-conformance-suites) shows how to run the suites locally.

| Suite | Pass | Expected failures | Depends on the environment |
|---|---:|---:|---:|
| `@nestjs/axios` `HttpModule` and `HttpService` specs | 20 | 3 | 0 |
| axios HTTP adapter tests, run against `httpService.axiosRef` | 161 | 78 | 3 |
| axios HTTP adapter tests, run against a bare adapter built from this package's transport | 127 | 112 | 3 |

These counts are from the 1.0.0 release. They are checked on every run, because a test that starts passing fails the run until it is taken off the list.

## `@nestjs/axios` specs

20 of the 23 specs pass. The other 3 check behaviour this package changed on purpose.

### Stream requests are cancelled on unsubscribe

The spec "HttpService (e2e) leaves a stream response running after teardown" makes a `responseType: 'stream'` request, unsubscribes before the response arrives, and expects the request to keep running.

`@nestjs/axios` never cancels a stream request on unsubscribe. The connection stays busy until the server finishes sending. This package cancels the request if the response headers haven't arrived yet, which frees the connection. Once the stream has been handed to your code, unsubscribing no longer cancels it, and the stream is yours to read or destroy. See the unsubscribe row in [Axios compatibility](/docs/axios-supported-options.md#httpservice).

### No `HTTP_MODULE_ID` provider

The spec "HttpModule register assigns a distinct module id per registration" reads the `HTTP_MODULE_ID` provider and checks that two `HttpModule.register()` calls get different ids.

`@nestjs/axios` registers a random id under that token for each registration. This package removed the provider because nothing used it. What the spec protects still holds: each registration gets its own `HttpService` instance, and the spec next to it checks that and passes.

### No `AXIOS_INSTANCE_TOKEN` provider

The spec "HttpModule registerAsync resolves the options token before the axios instance" injects `AXIOS_INSTANCE_TOKEN` and reads `.defaults.timeout` from it.

In `@nestjs/axios`, that token holds the axios instance. This package has no axios instance, so it has no such provider. Its nearest token, `UNDICI_INSTANCE_TOKEN`, holds the undici request options, which have no `.defaults`. If your code injects `AXIOS_INSTANCE_TOKEN`, inject `HttpService` and use `httpService.axiosRef` instead.

## axios HTTP adapter tests

axios' `tests/unit/adapters/http.test.js` runs twice. The first run replaces the `axios` import with `httpService.axiosRef`, the object your code gets, so it goes through the same config handling and interceptors as a real request. The second run plugs a bare adapter, built from this package's response, error and redirect code, into the real axios package. That run skips this package's config handling, so more of its tests can't apply. The numbers below are for the `axiosRef` run. 5 tests are excluded from both runs because they can't run against this package at all; `tests/upstream/axios/run.mjs` lists them.

Of the 81 listed tests in the `axiosRef` run:

- **45 are deliberate differences.**
  - 23 set `httpVersion` or `http2Options` per request or per instance. This package builds its connection pool once per module, so these are module-level options.
  - 14 set `proxy` per request. `proxy` is also module-level.
  - 6 use axios' `allowedSocketPaths` allowlist for `socketPath`, which isn't implemented.
  - 1 overrides `Content-Length` with a value that doesn't match the body. undici rejects that, to prevent request smuggling.
  - 1 expects `transitional.advertiseZstdAcceptEncoding` to add `zstd` to `Accept-Encoding`. zstd responses are decoded, but that flag isn't implemented. Set the `Accept-Encoding` header yourself instead.
- **26 test Node's `http` module rather than the HTTP behaviour.**
  - 11 inspect Node's own sockets and keep-alive agent. undici doesn't use them.
  - 7 depend on IPv6, DNS or protocol details of the machine running the tests.
  - 5 configure a custom axios `transport`. This package always sends through undici.
  - 2 import `AxiosError` from inside the axios source tree, so `instanceof` checks a different class.
  - 1 uses the legacy `axios.CancelToken` class, which `axiosRef` doesn't have. A `cancelToken` in the request config still works. A separate test cancels several requests with one shared token and compares the result with `@nestjs/axios`.
- **3 are differences already covered in [Axios compatibility](/docs/axios-supported-options.md).** 2 call `.get()` on `error.response.headers`, which is a plain object here, not an `AxiosHeaders` instance. 1 expects the default `User-Agent` to be `axios/<version>`. Here it's `nestjs-axios-undici/<version>`.
- **2 expect the error stack to include the caller's function.** axios adds a fresh stack trace when a request fails. Doing the same here cost over 40% more CPU per request on a workload where every request fails. The stack still wouldn't reach the caller through an RxJS Observable, so this isn't implemented.
- **2 aren't fully explained yet.** "should provides a default User-Agent header" and "should ignore inherited nested request option fields in http adapter" fail, and the cause hasn't been pinned down. They are the ones most likely to be real gaps.
- **3 depend on the environment.** They pass or fail depending on the network of the machine. The run accepts either result and reports them separately.
