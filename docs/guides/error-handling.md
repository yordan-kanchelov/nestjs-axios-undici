# Error Handling

`nestjs-axios-undici` follows axios semantics: responses with a status outside the 2xx range are emitted as errors.

## HTTP Status Codes

Failed responses reject with an axios-like error exposing `error.response`, `error.config`, `error.status` and `error.isAxiosError`:

```typescript
import { Injectable, HttpException } from '@nestjs/common';
import { HttpService } from 'nestjs-axios-undici';
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

Network errors (DNS failures, refused connections, timeouts, cancellations) are emitted as axios errors too, with the same `code` values axios uses (`ECONNREFUSED`, `ENOTFOUND`, `ECONNRESET`, `ECONNABORTED`, `ERR_CANCELED`, ...). The original undici/Node.js error is available as `error.cause`. Handle them with `try/catch` or RxJS operators:

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

A `timeout` (module-level or per request) maps to undici's `headersTimeout` and `bodyTimeout` (about 1s resolution). Like axios, a timeout rejects with `code: 'ECONNABORTED'` and the message `timeout of <n>ms exceeded`:

```typescript
import { isAxiosError } from 'nestjs-axios-undici';

try {
  await lastValueFrom(this.httpService.get('https://slow-api.com', { timeout: 2000 }));
} catch (error) {
  if (isAxiosError(error) && error.code === 'ECONNABORTED') {
    // Handle timeout; error.cause is the undici HeadersTimeoutError/BodyTimeoutError
  }
}
```

## Cancellation

Pass an `AbortSignal` (or an axios `CancelToken`). A cancelled request rejects with a `CanceledError` (`code: 'ERR_CANCELED'`), so `axios.isCancel(error)` and `isCancel(error)` from this package return `true`:

```typescript
const controller = new AbortController();
this.httpService.get('https://api.example.com', { signal: controller.signal }).subscribe();
controller.abort();
```

Unsubscribing from the Observable does not cancel the request; use a signal for that.
