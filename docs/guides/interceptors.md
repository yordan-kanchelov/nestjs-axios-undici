# Interceptors

`nestjs-axios-undici` supports request/response interceptors in two styles: the axios-style `axiosRef.interceptors` API and native interceptors. You can also use [Undici's Dispatcher system](https://github.com/nodejs/undici#dispatcher) for lower-level control.

## Axios-style Interceptors

Existing `@nestjs/axios` interceptor code keeps working, including `eject()` and `clear()`:

```typescript
@Injectable()
export class ApiService implements OnModuleInit {
  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use(config => {
      config.headers['Authorization'] = 'Bearer token';
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          // handle unauthorized
        }
        return Promise.reject(error);
      },
    );
  }
}
```

One difference from axios: request interceptors run in registration order and response interceptors in reverse registration order (axios does the opposite). See [Supported Axios Options](/docs/axios-supported-options.md#axiosref).

## Native Interceptors

A native interceptor receives the request (`{ url, options }`, where `options` are the undici request options) and the next handler, and returns an Observable. The response it sees is already axios-compatible (`status`, `data`, `headers`, ...), and non-2xx responses arrive as axios errors.

### Function interceptors

```typescript
import type { HttpInterceptorFunction } from 'nestjs-axios-undici';

const authInterceptor: HttpInterceptorFunction = (request, next) => {
  request.options.headers = { ...request.options.headers, Authorization: `Bearer ${getToken()}` };
  return next.handle(request);
};
```

Assign a new `headers` object (or pass a new request to `next.handle()`) rather than mutating `request.options.headers` in place: the object can be shared with the module's default headers.

For interceptors that need configuration, use a factory:

```typescript
export function createAuthInterceptor(token: string): HttpInterceptorFunction {
  return (request, next) => {
    request.options.headers = { ...request.options.headers, Authorization: `Bearer ${token}` };
    return next.handle(request);
  };
}

HttpModule.register({ interceptors: [createAuthInterceptor('my-token')] });
```

### Class interceptors

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { tap } from 'rxjs/operators';
import type { HttpInterceptor, HttpInterceptorHandler, HttpInterceptorRequest } from 'nestjs-axios-undici';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler) {
    const start = Date.now();
    return next.handle(request).pipe(
      tap(response => this.logger.log(`${request.url} ${response.status} ${Date.now() - start}ms`)),
    );
  }
}
```

### Order

Interceptors run in the order they are registered: the first one sees the request first and the response last. Interceptors added with `addInterceptor()` run after the ones passed to the module.

## Registering Interceptors

### In `register()`

`HttpModule.register({ interceptors })` accepts functions, classes and interceptor instances. Classes are instantiated by Nest inside the `HttpModule`:

```typescript
HttpModule.register({
  interceptors: [authInterceptor, LoggingInterceptor],
});
```

### At runtime

`httpService.addInterceptor()` accepts a function or an interceptor instance:

```typescript
this.httpService.addInterceptor((request, next) => next.handle(request));
```

### In `registerAsync()`

The options returned by `registerAsync()` accept the same interceptors as `register()`. Classes are instantiated inside the `HttpModule`, with their dependencies resolved from the module's `imports` and `extraProviders`:

```typescript
HttpModule.registerAsync({
  imports: [ConfigModule], // provides ConfigService, which ApiKeyInterceptor injects
  useFactory: () => ({ interceptors: [ApiKeyInterceptor] }),
});
```

## Interceptors with Dependencies

Because a class interceptor passed to `register()` is instantiated inside the `HttpModule`, its constructor dependencies must be resolvable from there. Adding the dependencies (or the interceptor) to your own module's `providers`, or to a module you import, is **not** enough:

```typescript
// ❌ Fails: "Nest can't resolve dependencies of the LoggingInterceptor"
@Module({
  imports: [HttpModule.register({ interceptors: [LoggingInterceptor] })],
  providers: [LoggerService, LoggingInterceptor],
})
export class AppModule {}
```

These patterns work:

### 1. Add the interceptor at startup (recommended)

Let Nest create the interceptor as a normal provider, then add it to the `HttpService`:

```typescript
@Injectable()
export class HttpInterceptorsSetup implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggingInterceptor: LoggingInterceptor,
  ) {}

  onModuleInit() {
    this.httpService.addInterceptor(this.loggingInterceptor);
  }
}

@Module({
  imports: [HttpModule.register({ timeout: 5000 })],
  providers: [LoggerService, LoggingInterceptor, HttpInterceptorsSetup],
})
export class AppModule {}
```

### 2. Use `registerAsync()`

List the modules that provide the dependencies in `imports` (or the providers in `extraProviders`) and pass the class:

```typescript
HttpModule.registerAsync({
  imports: [LoggerModule], // exports LoggerService
  useFactory: () => ({ interceptors: [LoggingInterceptor] }),
});
```

Or inject the dependencies into `useFactory` and return a function interceptor:

```typescript
HttpModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    timeout: 5000,
    interceptors: [
      (request, next) => {
        request.options.headers = { ...request.options.headers, 'X-API-Key': config.get('API_KEY') };
        return next.handle(request);
      },
    ],
  }),
});
```

### 3. Global dependencies

If every dependency comes from a `@Global()` module (for example `ConfigModule.forRoot({ isGlobal: true })`), the class can be passed to `register()` directly:

```typescript
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule.register({ interceptors: [ApiKeyInterceptor] }), // ApiKeyInterceptor injects ConfigService
  ],
})
export class AppModule {}
```

For testing interceptors, see [Testing](/docs/guides/testing.md#testing-interceptors).

## Custom Dispatchers

For connection pooling, proxies or mocks, use a custom undici `Dispatcher`, either in the module configuration (`dispatcher`), at runtime (`httpService.setGlobalDispatcher(...)`) or per request (`request(url, { dispatcher })`).

```typescript
import { Agent } from 'undici';

HttpModule.register({
  dispatcher: new Agent({ connections: 10 }),
});
```

Please refer to the [Undici documentation](https://github.com/nodejs/undici) for `MockAgent`, `ProxyAgent` and other dispatchers.
