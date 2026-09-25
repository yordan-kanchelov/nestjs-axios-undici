# Configuration Guide

The `nestjs-axios-undici` module allows you to configure the underlying `undici` client options.

> **Note**: The module always returns axios-compatible responses. No special configuration is needed for axios compatibility.

## Basic Configuration

Use the `register` method to configure the module synchronously. The configuration object matches the [Undici Request Options](https://github.com/nodejs/undici#undicirequesturl-options-promise).

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';

@Module({
  imports: [
    HttpModule.register({
      // Default headers for all requests
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MyApp/1.0',
      },
    }),
  ],
})
export class AppModule {}
```

### Timeout

Set the maximum time to wait for a response (mapped to undici's `headersTimeout` and `bodyTimeout`):

```typescript
HttpModule.register({
  timeout: 5000, // 5 seconds in milliseconds
});
```

### Interceptors

Configure HTTP interceptors for request/response modification:

```typescript
// Function-based interceptor
const authInterceptor: HttpInterceptorFunction = (request, next) => {
  request.options.headers = {
    ...request.options.headers,
    Authorization: 'Bearer ' + getToken(),
  };
  return next.handle(request);
};

// Class-based interceptor
@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler) {
    console.log('Request:', request.url);
    return next.handle(request);
  }
}

HttpModule.register({
  interceptors: [authInterceptor, LoggingInterceptor],
});
```

Class interceptors are instantiated inside `HttpModule`, so an interceptor that injects your own providers needs one of the patterns in [Interceptors with dependencies](/docs/guides/interceptors.md#interceptors-with-dependencies).

## Async Configuration

Use `registerAsync` to load configuration asynchronously, for example from a `ConfigService`.

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from 'nestjs-axios-undici';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        headers: {
          'Authorization': await configService.get('API_KEY'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Advanced Configuration (Dispatchers)

To configure advanced behavior like connection pooling, proxies, or mocks, you should use a custom `Dispatcher`. The `dispatcher` property can be passed in the configuration object, and always wins over any of the axios-style options below (`httpAgent`/`httpsAgent`, `socketPath`, `proxy`, `httpVersion`) - see [axios-supported-options.md](/docs/axios-supported-options.md#precedence-an-explicit-dispatcher-always-wins).

For the common axios-style cases - TLS options via `httpsAgent`, `socketPath`, an explicit `proxy` or the `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` environment variables, and `httpVersion: 2` - you don't need a `Dispatcher` at all; see [Module-level axios options](/docs/axios-supported-options.md#module-level-axios-options).

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';
import { Agent } from 'undici';

@Module({
  imports: [
    HttpModule.register({
      // Configure an Agent with specific connection options
      dispatcher: new Agent({
        connect: {
          timeout: 5000,
        },
        keepAliveTimeout: 10000,
        connections: 10,
      }),
    }),
  ],
})
export class AppModule {}
```

## Environment Variables

You can easily use environment variables within the `register` or `registerAsync` methods.

```typescript
HttpModule.register({
  headers: {
    'Authorization': process.env.API_KEY,
  },
});
```
