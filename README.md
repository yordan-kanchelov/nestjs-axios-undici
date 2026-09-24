# NestJS Axios Undici

> **Drop-in `@nestjs/axios` replacement built on [Undici](https://github.com/nodejs/undici)**: keep your `HttpModule`/`HttpService` code, get axios-compatible responses, errors and interceptors, with much lower latency. No axios dependency.
>
> Previously published as `nestjs-undici-interceptors`; originally forked from [nestjs-undici](https://github.com/hebertcisco/nestjs-undici) by Hebert Cisco.

> **Breaking Change in v0.4.0**: This library now always returns axios-compatible responses. All axios options are automatically detected and handled by the standard `register()` method.

[![npm version](https://badge.fury.io/js/nestjs-axios-undici.svg)](https://badge.fury.io/js/nestjs-axios-undici)
[![Forked from](https://img.shields.io/badge/forked%20from-nestjs--undici-blue)](https://github.com/hebertcisco/nestjs-undici)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

📖 **[Documentation](https://yordan-kanchelov.github.io/nestjs-axios-undici/)** · ✨ **[What's new in this fork](docs/features.md)** · 📊 **[Benchmarks](docs/benchmarks.md)** · 🔁 **[Migrating from @nestjs/axios](docs/migration-guide.md)**

**NestJS Axios Undici** is an HTTP client module for NestJS applications built on [@nodejs/undici](https://github.com/nodejs/undici), with the same API as `@nestjs/axios`.

## Fork Features

This fork adds the following features to the original package:
- ✅ **HTTP Interceptors**: Similar to @nestjs/axios, you can now intercept and modify requests/responses
- ✅ **Function-based interceptors**: Simple functions for request/response processing
- ✅ **Class-based interceptors**: Injectable classes implementing the HttpInterceptor interface
- ✅ **Dynamic interceptor registration**: Add interceptors at runtime
- ✅ **Axios-Compatible Responses**: All responses are now axios-compatible (v0.4.0+)
- 🆕 **Axios-style Interceptor API**: Use familiar `httpService.axiosRef.interceptors` syntax
- 🆕 **Automatic Axios Config Detection**: `register()` automatically maps axios options to undici
- 🆕 **Enhanced Migration Support**: Drop-in replacement with minimal code changes

## Features

- 🚀 Built on top of [@nodejs/undici](https://github.com/nodejs/undici)
- 🔄 Full TypeScript support
- ⚡ High-performance HTTP client
- 🔒 Secure by default
- 🛠️ Easy to configure and use
- 📦 Lightweight and dependency-free
- 📝 Comprehensive documentation
- 🎯 **Drop-in Replacement**: Can replace @nestjs/axios with minimal code changes
- 🔄 **Axios-Compatible**: All responses use axios format by default
- 🎯 **Smart Config Detection**: Automatically maps axios options to undici

## Installation

```bash
# Using npm
npm install nestjs-axios-undici undici

# Using yarn
yarn add nestjs-axios-undici undici
```

To use the original upstream package (raw Undici responses, no interceptors):
```bash
npm install nestjs-undici
```

## Quick Start

1. Import the `HttpModule` in your root module:

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';

@Module({
  imports: [
    HttpModule.register({
      // Optional configuration (Undici Request Options)
      headers: {
        'User-Agent': 'NestJS-Undici',
      },
    }),
  ],
})
export class AppModule {}
```

2. Inject and use the `HttpService` in your service:

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  constructor(private readonly httpService: HttpService) {}

  async getUsers() {
    // Responses are always axios-compatible (v0.4.0+)
    const response = await firstValueFrom(
      this.httpService.get('https://api.example.com/users')
    );

    return response.data; // Direct access to data property
  }
}
```

## Migration from @nestjs/axios

Migrating from @nestjs/axios is simple - just change your import:

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';

// After
import { HttpModule, HttpService } from 'nestjs-axios-undici';
```

Your existing code, including axios-style configuration and interceptors, will continue to work. The `register()` method automatically detects and maps axios options.

See the [Migration Guide](docs/migration-guide.md) for detailed instructions.


## Configuration

The `HttpModule` can be configured using the `register` or `registerAsync` methods. The configuration object accepts standard [Undici Request Options](https://github.com/nodejs/undici#undicirequesturl-options-promise) and an optional `dispatcher`.

### Synchronous Configuration

```typescript
import { Agent } from 'undici';

HttpModule.register({
  headers: {
    'Content-Type': 'application/json',
  },
  // You can set a custom dispatcher (e.g., for proxy or mocking)
  dispatcher: new Agent({
    connect: {
      timeout: 5000
    }
  }),
});
```

### Asynchronous Configuration

```typescript
HttpModule.registerAsync({
  useFactory: async (configService: ConfigService) => ({
    headers: {
      'Authorization': await configService.get('API_KEY'),
    },
  }),
  inject: [ConfigService],
});
```

## Advanced Usage

### Making HTTP Requests

```typescript
// POST request
const response = await lastValueFrom(
  this.httpService.request('https://api.example.com/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'John Doe' }),
  })
);
```

### Using Interceptors

Interceptors allow you to modify requests and responses globally. You can use either axios-style or native interceptors:

```typescript
// Axios-style (familiar syntax)
this.httpService.axiosRef.interceptors.request.use(
  (config) => {
    config.headers['Authorization'] = 'Bearer token';
    return config;
  }
);

// Native style (better performance)
this.httpService.addInterceptor((request, next) => {
  request.options.headers['Authorization'] = 'Bearer token';
  return next.handle(request);
});
```

See the [Interceptor Patterns](docs/interceptor-patterns.md) documentation for advanced usage.

### Performance Benefits

In our [benchmarks](docs/benchmarks.md) (a NestJS endpoint making 5 parallel upstream calls under load, Node.js 20-26):
- **71-74% lower latency** than `@nestjs/axios` on the same framework (Fastify)
- **74-75% lower latency** and roughly **4x the throughput** of the default Express + Axios setup
- Undici's connection pooling and keep-alive by default

```typescript
import { HttpModule, HttpService } from 'nestjs-axios-undici';

// Drop-in replacement for @nestjs/axios!
@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      // ... other options
    })
  ],
})
export class AppModule {}

// Your existing Axios code works without changes!
@Injectable()
export class MyService {
  constructor(private httpService: HttpService) {}

  async getData() {
    const response = await lastValueFrom(
      this.httpService.get('https://api.example.com/data')
    );

    // Works exactly like Axios!
    return response.data;  // Already parsed JSON
  }
}
```

All responses have the familiar Axios structure:
- `response.data` - Parsed response body (JSON/text/Buffer)
- `response.status` - HTTP status code (200, 404, etc.)
- `response.statusText` - HTTP status text ("OK", "Not Found", etc.)
- `response.headers` - Response headers
- `response.config` - Request configuration

**Important**: Just like Axios, responses with status codes >= 400 are thrown as errors with the same error structure as Axios (including `error.response`, `error.config`, and `error.isAxiosError`).

#### Simple Migration from @nestjs/axios

Migration is incredibly simple - just change the import:

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';

// After
import { HttpModule, HttpService } from 'nestjs-axios-undici';
```

That's it! Your existing code continues to work without any other changes. You get:
- ✅ Same response structure as Axios
- ✅ All convenience methods (get, post, put, delete, patch, etc.)
- ✅ Better performance with Undici
- ✅ Full compatibility with existing code
- ✅ Support for all RxJS operators
- ✅ TypeScript types work as expected

##### Supported Convenience Methods
All the familiar Axios methods are available:
- `httpService.get(url, config?)`
- `httpService.post(url, data?, config?)`
- `httpService.put(url, data?, config?)`
- `httpService.delete(url, config?)`
- `httpService.patch(url, data?, config?)`
- `httpService.head(url, config?)`
- `httpService.options(url, config?)`
- `httpService.postForm(url, data?, config?)`
- `httpService.putForm(url, data?, config?)`
- `httpService.patchForm(url, data?, config?)`

### Need Raw Undici Responses?

The library always returns axios-compatible responses for consistency and ease of use. If you need to work with raw Undici responses, consider using the `undici` package directly for those specific use cases.

## API Reference

For detailed API documentation, please visit our [documentation site](https://yordan-kanchelov.github.io/nestjs-axios-undici/).

## Testing

Run the test suite:

```bash
# All tests (unit + e2e + examples)
npm test

# Individual test suites
npm run test:unit          # Unit tests only
npm run test:unit:watch    # Unit tests in watch mode
npm run test:unit:cov      # Unit tests with coverage
npm run test:e2e           # E2E tests only
npm run test:examples      # Example tests only

# Verbose example tests
npm run test:examples:verbose
```

The `npm test` command runs all three test suites sequentially, ensuring comprehensive coverage including unit tests, e2e tests, and example validation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you find this package useful, please consider giving it a ⭐️ on [GitHub](https://github.com/yordan-kanchelov/nestjs-axios-undici).
