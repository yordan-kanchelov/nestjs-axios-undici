# nestjs-axios-undici

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
- Requires Node.js 22 or newer. Tested on Node.js 22, 24 and 26.

### Fixes

- `tough-cookie` is a runtime dependency (it was only a devDependency, which broke installs without automatic peer dependencies).

### Project

- Benchmarks (k6 + Docker across Node.js 22, 24 and 26, and a pull-request regression check) live in `benchmarks/` and run against the library code of each commit. Results: [benchmarks](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/benchmarks).
- Merged upstream `nestjs-undici` v0.2.60.
