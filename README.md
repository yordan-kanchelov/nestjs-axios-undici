# NestJS Axios Undici

**The `@nestjs/axios` API, powered by [Undici](https://github.com/nodejs/undici): change one import, keep your code, get about half the latency.**

[![npm version](https://img.shields.io/npm/v/nestjs-axios-undici.svg)](https://www.npmjs.com/package/nestjs-axios-undici)
[![Benchmarks](https://github.com/yordan-kanchelov/nestjs-axios-undici/actions/workflows/benchmarks.yml/badge.svg)](https://github.com/yordan-kanchelov/nestjs-axios-undici/actions/workflows/benchmarks.yml)
[![Tests](https://github.com/yordan-kanchelov/nestjs-axios-undici/actions/workflows/coverage.yml/badge.svg)](https://github.com/yordan-kanchelov/nestjs-axios-undici/actions/workflows/coverage.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

📖 **[Documentation](https://yordan-kanchelov.github.io/nestjs-axios-undici/)** · 📊 **[Benchmarks](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/benchmarks)** · 🔁 **[Migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide)** · ✨ **[Features](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/features)**

## Why nestjs-axios-undici?

`@nestjs/axios` is the default way to make HTTP calls in NestJS, and axios is not built for throughput. Undici is Node.js's own HTTP client: it keeps connections alive and pools them by default, and it does less work per request. This package gives you Undici without rewriting your services.

- 🚀 **About 2x the throughput, half the latency.** In our benchmark (a NestJS endpoint fanning out 5 upstream calls under load, with the same logging interceptor on both sides), it served **1.9-2.5x the requests per second** of `@nestjs/axios`, with **48-60% lower average and 54-62% lower p95 latency**, on Node.js 22, 24 and 26. The benchmarks run in CI on every change; see the [results](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/benchmarks).
- 🔁 **Drop-in replacement.** Same `HttpModule` / `HttpService`, same `register` / `registerAsync` options, same `get` / `post` / `put` / `patch` / `delete` methods and `request(config)`, the same response shape (`data`, `status`, `headers`) and the same errors (`isAxiosError`, `error.response`, `error.code`). A 65-test compatibility matrix runs every case against real `@nestjs/axios`.
- 🧩 **Interceptors, two ways.** Keep your `httpService.axiosRef.interceptors.request.use(...)` code, or use native interceptors: functions or injectable classes that wrap every request.
- 🪶 **No axios dependency.** Requests go straight through Undici.
- ✅ **Tested on Node.js 22, 24 and 26** (the current LTS lines), with a performance regression check on every pull request.

## Installation

```bash
npm install nestjs-axios-undici undici
```

## Migrating from @nestjs/axios

```typescript
// Before
import { HttpModule, HttpService } from '@nestjs/axios';

// After
import { HttpModule, HttpService } from 'nestjs-axios-undici';
```

Existing calls, axios options and `axiosRef` interceptors keep working. The [migration guide](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide) covers the remaining differences.

## Quick Start

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from 'nestjs-axios-undici';

@Module({
  imports: [
    HttpModule.register({
      baseURL: 'https://api.example.com',
      timeout: 5000,
      headers: { 'User-Agent': 'my-service' },
    }),
  ],
  providers: [UsersService],
})
export class AppModule {}
```

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UsersService {
  constructor(private readonly httpService: HttpService) {}

  async findAll() {
    const { data } = await firstValueFrom(
      this.httpService.get<User[]>('/users', { params: { active: true } }),
    );
    return data; // parsed JSON, like axios
  }

  create(user: CreateUserDto) {
    return this.httpService.post<User>('/users', user); // Observable<AxiosResponse-like>
  }
}
```

Non-2xx responses reject with an axios-style error (`error.response.status`, `error.code`), exactly like `@nestjs/axios`.

## Configuration

`register()` accepts axios options (`baseURL`, `timeout`, `headers`, `auth`, `params`, `maxRedirects`, `validateStatus`, `httpAgent`, `proxy`, `withCredentials`, ...) and Undici options (such as a custom `dispatcher`). `registerAsync()` applies the same mapping:

```typescript
HttpModule.registerAsync({
  imports: [ConfigModule],
  useFactory: (config: ConfigService) => ({
    baseURL: config.get('API_URL'),
    timeout: config.get('HTTP_TIMEOUT'),
  }),
  inject: [ConfigService],
});
```

See [Configuration](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/configuration) and [Supported Axios Options](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/axios-supported-options).

## Interceptors

```typescript
// Axios style, unchanged from @nestjs/axios
this.httpService.axiosRef.interceptors.request.use((config) => {
  config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

// Native: a function or an injectable class, registered on the module
@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler) {
    const start = Date.now();
    return next.handle(request).pipe(
      tap((response) => console.log(`${request.url} ${response.status} ${Date.now() - start}ms`)),
    );
  }
}

HttpModule.register({ interceptors: [LoggingInterceptor] });
```

More in [Interceptors](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/interceptors) and [Interceptor Patterns](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/interceptor-patterns).

## Documentation

- [Features](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/features)
- [Migration from @nestjs/axios](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/migration-guide)
- Guides: [Configuration](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/configuration) · [Making Requests](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/making-requests) · [Interceptors](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/interceptors) · [Error Handling](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/error-handling) · [Testing](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/guides/testing)
- API: [HttpModule](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/http/http.module) · [HttpService](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/http/http.service)
- [Benchmarks](https://yordan-kanchelov.github.io/nestjs-axios-undici/#/docs/benchmarks) and how to run them: [`benchmarks/`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks)

## Contributing

Contributions are welcome. Run `npm test` (unit, e2e and examples) before opening a pull request, and add a changeset (`npx changeset`) describing any change to the published package. Releases are cut automatically from the changesets; see [CHANGELOG.md](CHANGELOG.md).

## Credits

This project started as a fork of [nestjs-undici](https://github.com/hebertcisco/nestjs-undici) by [Hebert Cisco](https://github.com/hebertcisco). Thank you for the foundation it is built on.

## License

[MIT](LICENSE)
