# HttpModule

`HttpModule` provides `HttpService`. Its API matches `@nestjs/axios`' `HttpModule`: import it as is, or configure it with `register()` or `registerAsync()`.

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';

@Module({
  imports: [HttpModule],
})
export class AppModule {}
```

Each import of `HttpModule.register()` / `registerAsync()` creates its own `HttpService` with its own configuration and interceptors.

## `register(options)`

```typescript
HttpModule.register({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { 'User-Agent': 'MyApp/1.0' },
  interceptors: [authInterceptor, LoggingInterceptor],
});
```

## `registerAsync(options)`

Resolves the options at startup, for example from a `ConfigService`:

```typescript
HttpModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => ({
    baseURL: config.get('API_URL'),
    timeout: config.get('HTTP_TIMEOUT'),
  }),
});
```

| Option | Description |
|--------|-------------|
| `useFactory` | Function returning the options (or a Promise of them). |
| `inject` | Providers passed to `useFactory`. |
| `imports` | Modules whose exported providers `useFactory`, `useClass` or `useExisting` need. |
| `useClass` | A class implementing `HttpModuleOptionsFactory` (`createHttpOptions()`), instantiated by the module. |
| `useExisting` | Like `useClass`, but reuses an existing provider. |
| `extraProviders` | Additional providers registered in the module. |
| `global` | Registers the module as global. |

```typescript
@Injectable()
class HttpConfigService implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions {
    return { timeout: 5000 };
  }
}

HttpModule.registerAsync({ useClass: HttpConfigService });
```

## Options

`register()` and the object returned by `registerAsync()` accept:

- **Axios options**: `baseURL`, `headers`, `timeout`, `params`, `paramsSerializer`, `auth`, `validateStatus`, `responseType`, `maxRedirects`, `httpAgent`/`httpsAgent`, `proxy`, `withCredentials`, `maxBodyLength`/`maxContentLength`, `transformRequest`/`transformResponse`. They are detected and mapped to undici; see [Module-level axios options](/docs/axios-supported-options.md#module-level-axios-options) for what each one does and how it differs from axios.
- **Undici request options**, used as defaults for every request, for example `dispatcher`, `headersTimeout` and `bodyTimeout`. See the [undici `request()` options](https://github.com/nodejs/undici#undicirequesturl-options-promise).
- **`interceptors`**: an array of interceptors (see below).
- **`global`**: registers the module as global, as in `@nestjs/axios`.

## `interceptors`

An array of native interceptors, run in order for every request made through this module's `HttpService`:

```typescript
HttpModule.register({
  interceptors: [
    (request, next) => next.handle(request), // function interceptor
    LoggingInterceptor,                      // class implementing HttpInterceptor
  ],
});
```

- In `register()`, classes are instantiated by Nest inside `HttpModule`. Their constructor dependencies must be available there (for example from a `@Global()` module); providers of your own module are not visible to it.
- In `registerAsync()`, only functions are used.

See [Interceptors](/docs/guides/interceptors.md) for writing interceptors and for interceptors that inject other providers.

## `TypedHttpModule`

`TypedHttpModule.register(options)` behaves like `HttpModule.register(options)`. The returned module also carries a type-only marker, which `ExtractHttpServiceType<typeof module>` resolves to `HttpService`.
