# Migration Guide: From @nestjs/axios to nestjs-axios-undici

This guide helps you migrate from `@nestjs/axios` to `nestjs-axios-undici` with minimal code changes.

## Coming from `nestjs-undici-interceptors`

The package was renamed to `nestjs-axios-undici` in 0.6.0. The API is the same, so replace the dependency and the import path:

```bash
npm uninstall nestjs-undici-interceptors
npm install nestjs-axios-undici undici
```

```typescript
// Before
import { HttpModule, HttpService } from 'nestjs-undici-interceptors';
// After
import { HttpModule, HttpService } from 'nestjs-axios-undici';
```

0.6.0 also brings behaviour closer to axios. Check these if you relied on the old behaviour:

- Network, timeout and cancellation errors are wrapped in an `AxiosError` (`error.code` such as `ECONNREFUSED`, `ECONNABORTED`, `ERR_CANCELED`); the original undici error is kept in `error.cause`, so `instanceof undici.errors.*` checks must look at `error.cause`.
- String and `Buffer` request bodies get `Content-Type: application/x-www-form-urlencoded` by default, as in axios (previously `application/json`). Falsy primitive bodies (`0`, `false`, `''`) are no longer sent.
- Per-request headers are merged with module headers (case-insensitively) instead of replacing them.
- Requests now send default `Accept`, `User-Agent` and `Accept-Encoding` headers, as axios does. See [Supported Axios Options](/docs/axios-supported-options.md#request-config) for the exact values and how to override or remove them.
- Module-level `timeout`, `auth`, `params` and `maxRedirects` now apply to every request, including with `registerAsync`.
- `params`, `baseURL` joining, `responseType`, `signal`/`cancelToken`, `request(config)` and `axiosRef.defaults` / `axiosRef.get()` now work like axios. See [Supported Axios Options](/docs/axios-supported-options.md).

## Quick Start

The simplest migration path - just change your import:

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    })
  ]
})

// After
import { HttpModule, HttpService } from 'nestjs-axios-undici';

@Module({
  imports: [
    HttpModule.register({  // Same method, automatic detection!
      timeout: 5000,
      maxRedirects: 5,    // Follows up to 5 redirects, like axios
    })
  ]
})
```

The `HttpModule.register()` and `HttpModule.registerAsync()` methods automatically detect axios-style configuration options and map them to their undici equivalents. No need for special registration methods!

Most `@nestjs/axios` code works unchanged, but some behaviour differs (redirects are not followed by default, interceptor order, `instanceof AxiosError`, ...). Check the [compatibility matrix](/docs/axios-supported-options.md) before migrating.

## Key Features for Migration

### 1. Axios-style Interceptor API

You can continue using the familiar `axiosRef.interceptors` API:

```typescript
@Injectable()
export class MyService implements OnModuleInit {
  constructor(private httpService: HttpService) {}

  onModuleInit() {
    // Request interceptors
    this.httpService.axiosRef.interceptors.request.use(
      (config) => {
        config.headers['Authorization'] = 'Bearer token';
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptors
    this.httpService.axiosRef.interceptors.response.use(
      (response) => {
        console.log('Response:', response.status);
        return response;
      },
      (error) => {
        if (error.response?.status === 401) {
          // Handle unauthorized
        }
        return Promise.reject(error);
      }
    );
  }
}
```

### 2. AxiosHeaders Class

`nestjs-axios-undici` includes the `AxiosHeaders` class that matches axios's header handling:

```typescript
import { AxiosHeaders } from 'nestjs-axios-undici';

// Create headers just like in axios
const headers = new AxiosHeaders();
headers.set('Content-Type', 'application/json');
headers.set('Authorization', 'Bearer token');

// Common axios methods are supported
headers.get('content-type');  // Case-insensitive
headers.has('Authorization'); 
headers.delete('Authorization');
headers.forEach((value, key) => console.log(key, value));
```

### 3. Automatic Configuration Mapping

`baseURL`, `headers`, `params`, `auth`, `timeout`, `maxRedirects`, `validateStatus`, `httpAgent`/`httpsAgent`, `proxy`, `withCredentials`, `decompress`, `maxBodyLength`/`maxContentLength` and `transformRequest`/`transformResponse` are detected in `register()` and `registerAsync()` and mapped to undici. `socketPath` is not supported. See [Module-level axios options](/docs/axios-supported-options.md#module-level-axios-options) for how each one is mapped.

### 4. Axios-Compatible Responses

All responses are automatically transformed to match axios structure:

```typescript
const response = await firstValueFrom(this.httpService.get('/api/data'));

// These all work just like axios:
response.data       // Parsed response body
response.status     // HTTP status code
response.statusText // Status text (e.g., "OK")
response.headers    // Response headers
response.config     // Request configuration
```

### 5. Axios-Compatible Errors

Errors are also axios-compatible, including network errors, timeouts (`ECONNABORTED`) and cancellations (`ERR_CANCELED`). `axios.isAxiosError(error)` works; `error instanceof AxiosError` only works with the `AxiosError` class exported by `nestjs-axios-undici`:

```typescript
try {
  await firstValueFrom(this.httpService.get('/api/data'));
} catch (error) {
  if (error.isAxiosError) {
    console.log(error.response?.status);  // 404, 500, etc.
    console.log(error.response?.data);    // Error response body
    console.log(error.config);            // Request config
    console.log(error.toJSON());          // Serializable error
  }
}
```

## Common Migration Patterns

### Simple Service Migration

No code changes needed for basic services. `toPromise()` is deprecated in RxJS 7; use `firstValueFrom` / `lastValueFrom`:

```typescript
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ApiService {
  constructor(private httpService: HttpService) {}

  async getUsers() {
    const { data } = await firstValueFrom(this.httpService.get('/users'));
    return data;  // Works exactly the same!
  }
}
```

### OpenTelemetry Integration

Here's an example of migrating OpenTelemetry trace injection (more variants in [`examples/opentelemetry-integration.ts`](https://github.com/yordan-kanchelov/nestjs-axios-undici/blob/main/examples/opentelemetry-integration.ts)):

```typescript
import { HttpModule, HttpService, AxiosHeaders } from "nestjs-axios-undici";
import { DynamicModule, Global, Module, OnModuleInit } from "@nestjs/common";
import { context, propagation } from "@opentelemetry/api";

@Global()
@Module({})
export class HttpConfigModule implements OnModuleInit {
  public static forRoot(config?: HttpConfig): DynamicModule {
    const httpModule = HttpModule.register({
      timeout: config?.timeout ?? 5000,
      maxRedirects: config?.maxRedirects ?? 5,
    });

    return {
      module: HttpConfigModule,
      imports: [httpModule],
      exports: [httpModule],
    };
  }

  constructor(private readonly httpService: HttpService) {}

  public onModuleInit() {
    // Add Axios-compatible interceptor to inject OpenTelemetry trace context
    this.httpService.axiosRef.interceptors.request.use((config) => {
      // Inject OpenTelemetry trace context into headers
      const traceHeaders: Record<string, string> = {};
      propagation.inject(context.active(), traceHeaders);

      const headers = AxiosHeaders.from(config.headers);
      Object.entries(traceHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      config.headers = headers;

      return config;
    });
  }
}
```

### Native Undici Interceptors (Optional)

You can optionally move to native interceptors. They work on the undici request directly and skip the conversion to and from an axios config that `axiosRef` interceptors need:

```typescript
this.httpService.addInterceptor((request, next) => {
  request.options.headers = { ...request.options.headers, 'X-Request-ID': randomUUID() };

  return next.handle(request).pipe(
    tap({
      error: (error) => this.logger.error(error)
    })
  );
});
```

## Handling Special Cases

### HTTP/HTTPS Agents

If you need custom agent configuration beyond what's automatically mapped:

```typescript
import { Agent } from 'undici';

HttpModule.register({
  dispatcher: new Agent({
    connections: 100,
    pipelining: 10,
  })
})
```

### Proxy Support

For advanced proxy configurations:

```typescript
import { ProxyAgent } from 'undici';

HttpModule.register({
  dispatcher: new ProxyAgent('http://proxy.example.com:8080')
})
```

### Request/Response Transforms

Use interceptors for transforms:

```typescript
this.httpService.axiosRef.interceptors.request.use((config) => {
  // Transform request data
  if (config.data) {
    config.data = transformRequest(config.data);
  }
  return config;
});

this.httpService.axiosRef.interceptors.response.use((response) => {
  // Transform response data
  response.data = transformResponse(response.data);
  return response;
});
```

## Gradual Migration Strategy

The two packages export different `HttpService` classes, so both modules can be imported side by side while you migrate services one at a time:

```typescript
import { HttpModule as AxiosHttpModule, HttpService as AxiosHttpService } from '@nestjs/axios';
import { HttpModule, HttpService } from 'nestjs-axios-undici';

@Module({
  imports: [
    AxiosHttpModule.register({ /* axios config */ }),
    HttpModule.register({ /* same config */ }),
  ],
  providers: [LegacyService, MigratedService],
})
export class AppModule {}

@Injectable()
export class LegacyService {
  constructor(private readonly http: AxiosHttpService) {}
}

@Injectable()
export class MigratedService {
  constructor(private readonly http: HttpService) {}
}
```

## Performance

In the [benchmarks](/docs/benchmarks.md) (a NestJS endpoint making 5 parallel upstream calls under load, with the same logging interceptor on both sides), `nestjs-axios-undici` served 1.9-2.5x the requests per second of `@nestjs/axios`, with 48-60% lower average latency, on Node.js 22, 24 and 26. Results for your workload will vary.

## Summary

Migration from `@nestjs/axios` is straightforward:

1. **Change imports** from `@nestjs/axios` to `nestjs-axios-undici`
2. **Review the [known differences](/docs/axios-supported-options.md)** (redirects, interceptor order, response parsing)
3. The `HttpModule.register()` method automatically detects and maps axios options
4. Existing interceptor code works with `httpService.axiosRef.interceptors`
5. Response structure and error handling remain the same

The library automatically handles:
- Configuration mapping (timeout, maxRedirects, agents, proxy, etc.)
- Response transformation to axios-compatible format
- Error structure compatibility
- All convenience methods (get, post, put, delete, etc.)
- AxiosHeaders class for full header compatibility

The axios-compatible API is the main API of this package; native interceptors and undici options are there when you need them.

## Need Help?

- See [Supported Axios Options](/docs/axios-supported-options.md) for all configuration options
- See [Interceptors](/docs/guides/interceptors.md) for native interceptors and interceptors with dependencies
- Browse the [examples](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/examples) for runnable code, including [`axios-to-undici-migration.ts`](https://github.com/yordan-kanchelov/nestjs-axios-undici/blob/main/examples/axios-to-undici-migration.ts)