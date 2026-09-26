# HttpService

`HttpService` makes the HTTP requests. Its methods match `@nestjs/axios`' `HttpService`: they return an RxJS `Observable` that emits an axios-compatible response, and non-2xx responses are emitted as axios errors.

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UsersService {
  constructor(private readonly httpService: HttpService) {}

  async getUser(id: number) {
    const { data } = await firstValueFrom(this.httpService.get<User>(`https://api.example.com/users/${id}`));
    return data;
  }
}
```

See [Making Requests](/docs/guides/making-requests.md) and [Error Handling](/docs/guides/error-handling.md) for usage.

## Request methods

All methods return `Observable<AxiosLikeResponse<T>>`.

| Method | Description |
|--------|-------------|
| `request<T>(config)` | Axios call form: `{ url, method, params, data, headers, ... }`. |
| `request<T>(url, options?)` | Undici call form: `url` plus [undici request options](https://github.com/nodejs/undici#undicirequesturl-options-promise) and the axios per-request options. |
| `get<T>(url, config?)` | |
| `delete<T>(url, config?)` | |
| `head<T>(url, config?)` | |
| `options<T>(url, config?)` | |
| `post<T>(url, data?, config?)` | |
| `put<T>(url, data?, config?)` | |
| `patch<T>(url, data?, config?)` | |
| `query<T>(url, data?, config?)` | The HTTP `QUERY` method (matching `@nestjs/axios` 12 / axios ≥1.13). |
| `postForm<T>(url, data?, config?)` | Sent as `multipart/form-data`, matching axios' own `postForm` - a `FormData`/`form-data` instance as-is, a plain object converted to one. An explicit `Content-Type` header does not change this (neither does axios'). |
| `putForm<T>(url, data?, config?)` | Same as `postForm`. |
| `patchForm<T>(url, data?, config?)` | Same as `postForm`. |

`config` accepts the axios per-request options (`headers`, `params`, `paramsSerializer`, `baseURL`, `auth`, `timeout`, `signal`, `cancelToken`, `responseType`, `validateStatus`, `maxRedirects`, `maxContentLength`, ...) as well as undici request options such as `dispatcher`. See [Request config](/docs/axios-supported-options.md#request-config).

## Response

| Property | Description |
|----------|-------------|
| `data` | Parsed body: JSON for JSON content types, a string for text, a `Buffer` for binary content. |
| `status`, `statusText` | HTTP status code and text. |
| `headers` | Response headers, with lower-case names. |
| `config` | The request config: `url` and `baseURL` as given (not combined), `params` as given, a lower-case `method`, `headers` as `AxiosHeaders` (case-insensitive lookup, but `toJSON()`/iteration report the casing each header was first set with - matching axios), `data` (the serialised body), `timeout`, `validateStatus`, and any custom field set by a request interceptor. Built lazily (only when read) unless axiosRef interceptors or a `transformRequest`/`transformResponse` are in play. |

## `axiosRef`

A real, callable axios instance, for code written against `@nestjs/axios`' `httpService.axiosRef` - it stands in for `AxiosInstance`:

- **Callable**: `axiosRef(config)` and `axiosRef(url, config)` both resolve like `axios(...)` (this is what libraries like `axios-retry` rely on).
- `axiosRef.request(config)`, `get`, `delete`, `head`, `options`, `post`, `put`, `patch`, `postForm`, `putForm`, `patchForm`, `query`, each returning a `Promise` of the response.
- `axiosRef.getUri(config?)` - the full URL a request would be sent to (`baseURL` + `params` applied), without sending it.
- `axiosRef.create(config?)` - a new axios-like instance that shares this `HttpService`'s transport/dispatcher, module-level interceptors and redirect handling, but has its own `interceptors` and its own `defaults` (merged from this one, the way `axios.create()` merges from the instance it's called on - see below).
- `axiosRef.interceptors.request.use(onFulfilled, onRejected, options?)` / `axiosRef.interceptors.response.use(...)`, returning an id for `eject(id)`; `clear()` removes all of them. `options.runWhen`/`options.synchronous` work like axios.
- `axiosRef.defaults` - see below.

```typescript
this.httpService.axiosRef.defaults.headers.common['Authorization'] = `Bearer ${token}`;
const { data } = await this.httpService.axiosRef.get('https://api.example.com/users');

// axios-retry, axios-mock-adapter and similar libraries that expect a real
// axios instance work directly against axiosRef:
axiosRetry(this.httpService.axiosRef, { retries: 3 });
new MockAdapter(this.httpService.axiosRef);
```

### `axiosRef.defaults`

Covers the axios defaults this library honours at request time: `baseURL`, `headers` (`common`/`get`/`post`/.../`patch`), `timeout`, `maxRedirects`, `params`, `paramsSerializer`, `validateStatus`, `responseType`, `transformRequest`, `transformResponse`, `adapter` and `withCredentials` (accepted, a no-op). `HttpModule.register()`/`.registerAsync()` options seed `defaults` once, at construction - exactly like `axios.create(moduleOptions)` seeds a real axios instance's `defaults`. From then on, **`defaults` is the single source of truth**: a runtime mutation (`axiosRef.defaults.headers.common['X'] = '...'`, `axiosRef.defaults.timeout = 5000`, ...) applies to every later request and always wins over the module-level value it started out equal to - mutating the object passed to `register()` afterwards, or `httpService.undiciRef`, no longer has any effect. Precedence is **request config > `axiosRef.defaults` > module options** for every one of these fields, uniformly (this replaces an earlier, narrower rule where module `headers` specifically always won over `axiosRef.defaults` - see the migration guide).

`axiosRef.create(config)` merges `config` onto the parent's current `defaults` the way `axios.create()`/`mergeConfig` does: `headers` per bucket (a header set for one method overrides the parent's for that bucket only), everything else overriding outright when `config` sets it. The child's `defaults` (and its `interceptors`) are then fully independent of the parent's - mutating one never affects the other - while both still share the same underlying transport/dispatcher and the module's generic interceptors/redirect handling.

### Function `adapter`

`config.adapter`/`axiosRef.defaults.adapter` may be a function: `(config) => Promise<response>`, called with the final, fully-resolved config instead of dispatching through undici. Its resolved response still runs through `validateStatus`, `transformResponse` and any response interceptors, exactly like a real network response - this is what makes [`axios-mock-adapter`](https://github.com/ctimmerm/axios-mock-adapter) work unmodified against `axiosRef`. A string adapter name (`'http'`/`'xhr'`/`'fetch'`) or an array is accepted for type compatibility but ignored: this library always dispatches through undici when no function adapter is set.

```typescript
import MockAdapter from 'axios-mock-adapter';

const mock = new MockAdapter(httpService.axiosRef);
mock.onGet('/users/1').reply(200, { id: 1, name: 'Ada' });
```

See [`axiosRef`](/docs/axios-supported-options.md#axiosref) for the remaining differences from a real axios instance (mainly `AxiosHeaders`-adjacent, and one TypeScript-only generics gap).

## `addInterceptor(interceptor)`

Adds a native interceptor (a function or an object with an `intercept()` method) after the existing ones. It returns nothing; to remove interceptors later, use `axiosRef.interceptors` and `eject()`.

```typescript
this.httpService.addInterceptor((request, next) => {
  request.options.headers = { ...request.options.headers, 'X-Request-ID': randomUUID() };
  return next.handle(request);
});
```

See [Interceptors](/docs/guides/interceptors.md).

## `interceptorCount`

Read-only. The number of interceptors in this service's chain: native interceptors (`addInterceptor`/module `interceptors`), live `axiosRef` request/response interceptors, and the axios response adapter (always present).

## `setGlobalDispatcher(dispatcher)`

Sets the undici `Dispatcher` used by later requests made through this `HttpService`. Despite the name, it does not change undici's global dispatcher. A `dispatcher` passed per request takes precedence. Neither applies when the module creates its own dispatcher (`proxy`, `cookieJar`, `socketPath`, or `httpAgent`/`httpsAgent` with `maxSockets`).

```typescript
import { Agent } from 'undici';

this.httpService.setGlobalDispatcher(new Agent({ connections: 10 }));
```

## `undiciRef`

Read-only. The undici request options this service uses as defaults for every request (module `headers`, timeouts, `dispatcher`, ...).
