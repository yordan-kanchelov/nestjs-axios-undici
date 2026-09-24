# Making Requests

The `HttpService` provides an axios-compatible API on top of the [undici](https://github.com/nodejs/undici) client. Every method returns an RxJS `Observable` that emits an axios-like response.

## Basic Usage

```typescript
import { Injectable } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CatsService {
  constructor(private readonly httpService: HttpService) {}

  async findAll() {
    const response = await lastValueFrom(
      this.httpService.get<Cat[]>('https://api.example.com/cats')
    );
    return response.data; // Already parsed JSON
  }
}
```

## Convenience Methods

The familiar axios methods are available: `get`, `post`, `put`, `delete`, `patch`, `head`, `options`, `postForm`, `putForm` and `patchForm`.

```typescript
async create(cat: CreateCatDto) {
  const response = await lastValueFrom(
    this.httpService.post<Cat>('https://api.example.com/cats', cat)
  );
  return response.data; // Objects are serialized to JSON automatically
}
```

## Low-level `request`

`request(url, options)` accepts [undici request options](https://github.com/nodejs/undici#undicirequesturl-options-promise) (`method`, `headers`, `body`, `query`, `dispatcher`, ...) plus `timeout` and `maxRedirections`:

```typescript
this.httpService.request('https://api.example.com/search', {
  query: { q: 'nestjs', page: 1 },
  timeout: 5000,
  maxRedirections: 3,
});
```

## Response Handling

Responses have the axios structure:

- `data`: Parsed response body (JSON, text or `Buffer`)
- `status` / `statusText`: HTTP status code and text
- `headers`: Response headers
- `config`: Request configuration

Like axios, non-2xx responses are emitted as errors (see [Error Handling](/docs/guides/error-handling.md)).
