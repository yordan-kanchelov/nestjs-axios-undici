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
| Axios-compatible errors for non-2xx responses | ❌ | ✅ |
| Convenience methods (`get`, `post`, `put`, `patch`, ...) | ❌ | ✅ |
| Axios configuration auto-mapping in `register()` | ❌ | ✅ |
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

Existing `@nestjs/axios` interceptor code keeps working:

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

## Convenience Methods

`get`, `post`, `put`, `delete`, `patch`, `head`, `options`, `postForm`, `putForm` and `patchForm` accept the same arguments as their axios counterparts. Objects are serialized to JSON automatically.

## Axios Configuration Auto-mapping

`HttpModule.register()` detects axios options and maps them to Undici equivalents:

| Axios option | Undici behaviour |
|--------------|------------------|
| `baseURL` | Relative request URLs resolve against it |
| `timeout` | `headersTimeout` + `bodyTimeout` |
| `maxRedirects` | Undici redirect interceptor (works on undici 7.x) |
| `httpAgent` / `httpsAgent` | Undici `Agent` connection options |
| `proxy` | Undici `ProxyAgent` (with auth) |
| `withCredentials` | Cookie jar via `http-cookie-agent` |
| `maxBodyLength` / `maxContentLength` | Size-limit interceptor |
| `auth` | `Authorization: Basic ...` header |
| `validateStatus`, `transformRequest`, `transformResponse`, `paramsSerializer` | Applied in the interceptor chain |
| `socketPath` | Unix socket requests |

Details: [Supported Axios Options](/docs/axios-supported-options.md).

## Migrating from @nestjs/axios

In most cases, only the import changes:

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';
// After
import { HttpModule, HttpService } from 'nestjs-undici-interceptors';
```

Read the full [Migration Guide](/docs/migration-guide.md) for special cases such as agents, proxies, transforms and OpenTelemetry.
