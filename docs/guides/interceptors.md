# Interceptors

`nestjs-undici-interceptors` supports request/response interceptors in two styles, and still lets you use [Undici's Dispatcher system](https://github.com/nodejs/undici#dispatcher) for lower-level control.

## Axios-style Interceptors

```typescript
this.httpService.axiosRef.interceptors.request.use(config => {
  config.headers['Authorization'] = 'Bearer token';
  return config;
});

this.httpService.axiosRef.interceptors.response.use(response => {
  console.log(response.status);
  return response;
});
```

## Native Interceptors

Native interceptors wrap the request as an Observable chain. They run outside the built-in axios response adapter, so the response they receive is already axios-compatible (`status`, `data`, `headers`, ...).

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { tap } from 'rxjs/operators';
import type { HttpInterceptor, HttpInterceptorHandler, HttpInterceptorRequest } from 'nestjs-undici-interceptors';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler) {
    const start = Date.now();
    return next.handle(request).pipe(
      tap(response => this.logger.log(`${request.url} ${response.status} ${Date.now() - start}ms`))
    );
  }
}
```

Register interceptors on the module (classes are resolved through DI) or at runtime:

```typescript
HttpModule.register({
  interceptors: [LoggingInterceptor],
});

// or
this.httpService.addInterceptor((request, next) => next.handle(request));
```

See [Interceptor Patterns](/docs/interceptor-patterns.md) for more examples.

## Custom Dispatchers

For connection pooling, proxies or mocks, use a custom undici `Dispatcher`, either in the module configuration (`dispatcher`), at runtime (`httpService.setGlobalDispatcher(...)`) or per request (`request(url, { dispatcher })`).

```typescript
import { Agent } from 'undici';

HttpModule.register({
  dispatcher: new Agent({ connections: 10 }),
});
```

Please refer to the [Undici documentation](https://github.com/nodejs/undici) for `MockAgent`, `ProxyAgent` and other dispatchers.
