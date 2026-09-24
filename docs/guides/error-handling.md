# Error Handling

`nestjs-undici-interceptors` follows axios semantics: responses with a status outside the 2xx range are emitted as errors.

## HTTP Status Codes

Failed responses reject with an axios-like error exposing `error.response`, `error.config`, `error.status` and `error.isAxiosError`:

```typescript
import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from 'nestjs-undici-interceptors';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CatsService {
  constructor(private readonly httpService: HttpService) {}

  async findOne(id: string) {
    try {
      const response = await lastValueFrom(
        this.httpService.get(`https://api.example.com/cats/${id}`)
      );
      return response.data;
    } catch (error) {
      if (error.isAxiosError && error.response?.status === 404) {
        throw new HttpException('Cat not found', 404);
      }
      throw error;
    }
  }
}
```

To accept other status codes, pass `validateStatus` in the module configuration, as you would with axios.

## Network Errors

Network errors (DNS failures, refused connections, timeouts) are emitted as errors too. Handle them with `try/catch` or RxJS operators:

```typescript
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

this.httpService.get('https://api.example.com')
  .pipe(
    catchError(error => {
      console.error('Error:', error);
      return throwError(() => new Error('Something went wrong'));
    })
  )
  .subscribe();
```

## Timeouts

A `timeout` (module-level or per request) maps to undici's `headersTimeout` and `bodyTimeout`:

```typescript
import { errors } from 'undici';

try {
  await lastValueFrom(this.httpService.get('https://slow-api.com', { timeout: 2000 }));
} catch (error) {
  if (error instanceof errors.HeadersTimeoutError || error instanceof errors.BodyTimeoutError) {
    // Handle timeout
  }
}
```
