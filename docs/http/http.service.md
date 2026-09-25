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
| `postForm<T>(url, data?, config?)` | `FormData` is sent as `multipart/form-data`, other data url-encoded. |
| `putForm<T>(url, data?, config?)` | Same as `postForm`. |
| `patchForm<T>(url, data?, config?)` | Same as `postForm`. |

`config` accepts the axios per-request options (`headers`, `params`, `paramsSerializer`, `baseURL`, `auth`, `timeout`, `signal`, `cancelToken`, `responseType`, `validateStatus`, `maxRedirects`, `maxContentLength`, ...) as well as undici request options such as `dispatcher`. See [Request config](/docs/axios-supported-options.md#request-config).

## Response

| Property | Description |
|----------|-------------|
| `data` | Parsed body: JSON for JSON content types, a string for text, a `Buffer` for binary content. |
| `status`, `statusText` | HTTP status code and text. |
| `headers` | Response headers, with lower-case names. |
| `config` | The request `url`, `method`, `headers`, `timeout` and `validateStatus`. |

## `axiosRef`

An axios-instance-like object, for code written against `@nestjs/axios`' `httpService.axiosRef`:

- `axiosRef.interceptors.request.use(onFulfilled, onRejected)` / `axiosRef.interceptors.response.use(...)`, returning an id for `eject(id)`; `clear()` removes all of them.
- `axiosRef.defaults.baseURL`, `axiosRef.defaults.timeout` and `axiosRef.defaults.headers` (`common`, `get`, `post`, ...), applied to every later request.
- `axiosRef.request(config)`, `get`, `delete`, `head`, `options`, `post`, `put`, `patch`, returning a Promise of the response.

```typescript
this.httpService.axiosRef.defaults.headers.common['Authorization'] = `Bearer ${token}`;
const { data } = await this.httpService.axiosRef.get('https://api.example.com/users');
```

Other `AxiosInstance` members are not available. See [`axiosRef`](/docs/axios-supported-options.md#axiosref) for the differences from axios.

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

Read-only. The number of interceptors in this service's chain.

## `setGlobalDispatcher(dispatcher)`

Sets the undici `Dispatcher` used by later requests made through this `HttpService`. Despite the name, it does not change undici's global dispatcher. A `dispatcher` passed per request takes precedence. Neither applies when the module creates its own dispatcher (`proxy`, `withCredentials`, or `httpAgent`/`httpsAgent` with `maxSockets`).

```typescript
import { Agent } from 'undici';

this.httpService.setGlobalDispatcher(new Agent({ connections: 10 }));
```

## `undiciRef`

Read-only. The undici request options this service uses as defaults for every request (module `headers`, timeouts, `dispatcher`, ...).
