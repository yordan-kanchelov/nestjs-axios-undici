# What's New in This Fork

`nestjs-undici-interceptors` is a fork of [nestjs-undici](https://github.com/hebertcisco/nestjs-undici) that keeps Undici's speed and adds what you need to replace `@nestjs/axios`: interceptors, axios-compatible responses and axios-style configuration. It tracks upstream, most recently merged at upstream v0.2.60.

```bash
npm install nestjs-undici-interceptors undici
```

## At a Glance

| Feature | nestjs-undici | nestjs-undici-interceptors |
|---------|:-------------:|:--------------------------:|
| Undici-based HTTP client | ✅ | ✅ |
| Request/response interceptors (function and class) | ❌ | ✅ |
| Axios-style `axiosRef.interceptors` API | ❌ | ✅ |
| Axios-compatible responses (`data`, `status`, `headers`) | ❌ | ✅ |
| Axios-compatible errors (status, network, timeout, cancel) with axios error codes | ❌ | ✅ |
| `request(config)` and convenience methods (`get`, `post`, `put`, `patch`, ...) | ❌ | ✅ |
| Axios request config: `params`, `data`, `auth`, `signal`, `responseType`, ... | ❌ | ✅ |
| `axiosRef.defaults` and promise-based `axiosRef.get/post/...` | ❌ | ✅ |
| Axios configuration auto-mapping in `register()` and `registerAsync()` | ❌ | ✅ |
| `AxiosHeaders` class | ❌ | ✅ |
| Typed module (`TypedHttpModule`) | ❌ | ✅ |
| Tested on Node.js 20, 22, 24 and 26 | - | ✅ |

See the [benchmarks](/docs/benchmarks.md) for how it compares to `@nestjs/axios`.

## Interceptors

Add cross-cutting behaviour such as auth headers, logging and tracing once, for every request.

```typescript
// Function-based
const authInterceptor: HttpInterceptorFunction = (request, next) => {
  request.options.headers = { ...request.options.headers, Authorization: `Bearer ${getToken()}` };
  return next.handle(request);
};

// Class-based (resolved through Nest DI)
@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler) {
    const start = Date.now();
    return next.handle(request).pipe(
      tap(response => console.log(`${request.url} ${response.status} ${Date.now() - start}ms`)),
    );
  }
}

HttpModule.register({ interceptors: [authInterceptor, LoggingInterceptor] });
```

Interceptors can also be added at runtime with `httpService.addInterceptor(...)`. See [Interceptors](/docs/guides/interceptors.md) and [Interceptor Patterns](/docs/interceptor-patterns.md).

## Axios-style Interceptor API

Existing `@nestjs/axios` interceptor code keeps working, including `eject()` and `clear()`. One difference: request interceptors run in registration order and response interceptors in reverse registration order, the opposite of axios.

```typescript
this.httpService.axiosRef.interceptors.request.use(config => {
  config.headers.set('x-request-id', randomUUID());
  return config;
});

this.httpService.axiosRef.interceptors.response.use(
  response => response,
  error => Promise.reject(error),
);
```

## Axios-compatible Responses and Errors

Every response has the axios shape, with the body already parsed:

```typescript
const { data, status, statusText, headers } = await lastValueFrom(
  this.httpService.get<User[]>('https://api.example.com/users'),
);
```

As with axios, a non-2xx status rejects with an error carrying `error.response`, `error.config`, `error.status` and `error.isAxiosError`. Use `validateStatus` to change which statuses count as success.

Network failures, timeouts and cancellations are axios errors too, with the axios `code` values (`ERR_BAD_REQUEST`, `ERR_BAD_RESPONSE`, `ECONNABORTED`, `ERR_CANCELED`, `ECONNREFUSED`, ...), so `axios.isAxiosError(error)` and `axios.isCancel(error)` work. `error instanceof AxiosError` only holds for the `AxiosError` class exported by this package.

JSON is parsed only for JSON content types, and unknown binary content types are returned as a `Buffer` (axios returns a string).

## Convenience Methods

`request(config)`, `get`, `post`, `put`, `delete`, `patch`, `head`, `options`, `postForm`, `putForm` and `patchForm` accept the same arguments as their axios counterparts, including `params`, `paramsSerializer`, `data`, `auth`, `baseURL`, `timeout`, `signal`, `cancelToken`, `responseType`, `validateStatus` and `maxRedirects`. Request data is serialized like axios: objects as JSON, `URLSearchParams` url-encoded, `FormData` as multipart, strings and buffers as-is. `postForm` with a plain object sends it url-encoded (axios sends multipart).

## Axios Configuration Auto-mapping

`HttpModule.register()` and `HttpModule.registerAsync()` detect axios options and map them to Undici equivalents:

| Axios option | Undici behaviour |
|--------------|------------------|
| `baseURL` | Joined with relative request URLs like axios (a path prefix is kept) |
| `headers`, `auth`, `params`, `paramsSerializer`, `responseType` | Applied to every request |
| `timeout` | `headersTimeout` + `bodyTimeout` (about 1s resolution) |
| `maxRedirects` | Undici redirect interceptor (works on undici 7.x). Redirects are not followed unless it is set |
| `httpAgent` / `httpsAgent` | Undici `Agent` connection options |
| `proxy` | Undici `ProxyAgent` (with auth) |
| `withCredentials` | Cookie jar via `http-cookie-agent` |
| `maxBodyLength` / `maxContentLength` | Size-limit interceptor |
| `auth` | `Authorization: Basic ...` header |
| `validateStatus` | Applied when the response is adapted |
| `transformRequest`, `transformResponse` | Applied in the interceptor chain, on the serialized request body and the parsed response data |

`decompress` and `socketPath` are not supported. Details and the full compatibility matrix: [Axios Compatibility](/docs/axios-supported-options.md).

## Migrating from @nestjs/axios

In most cases, only the import changes (check the [compatibility matrix](/docs/axios-supported-options.md) for the known differences):

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';
// After
import { HttpModule, HttpService } from 'nestjs-undici-interceptors';
```

Read the full [Migration Guide](/docs/migration-guide.md) for special cases such as agents, proxies, transforms and OpenTelemetry.
