# Testing

You can test services that use `nestjs-axios-undici` either by mocking the `HttpService` directly or by using Undici's `MockAgent`.

## Mocking HttpService

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from 'nestjs-axios-undici';
import { of } from 'rxjs';
import { CatsService } from './cats.service';

describe('CatsService', () => {
  let service: CatsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatsService,
        { provide: HttpService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<CatsService>(CatsService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should find all cats', async () => {
    jest.spyOn(httpService, 'get').mockReturnValue(
      of({ data: [{ name: 'Cat 1' }], status: 200, statusText: 'OK', headers: {}, config: {} } as any),
    );

    expect(await service.findAll()).toEqual([{ name: 'Cat 1' }]);
  });
});
```

## Using Undici MockAgent

`MockAgent` intercepts requests inside the Node.js process, so the real `HttpService` logic (interceptors, axios adapter) is exercised.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule } from 'nestjs-axios-undici';
import { MockAgent } from 'undici';
import { CatsService } from './cats.service';

describe('CatsService (Integration)', () => {
  let service: CatsService;

  beforeEach(async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent
      .get('https://api.example.com')
      .intercept({ path: '/cats', method: 'GET' })
      .reply(200, [{ name: 'Cat 1' }], { headers: { 'content-type': 'application/json' } });

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({ dispatcher: mockAgent })],
      providers: [CatsService],
    }).compile();

    service = module.get<CatsService>(CatsService);
  });

  it('should return cats from mock agent', async () => {
    expect(await service.findAll()).toEqual([{ name: 'Cat 1' }]);
  });
});
```

## Testing Interceptors

An interceptor is a function (or an `intercept()` method) that takes a request and a handler, so it can be tested without a module or a server. Stub `next.handle()` and check the request it receives:

```typescript
import { of, lastValueFrom } from 'rxjs';
import type { HttpInterceptorHandler, HttpInterceptorRequest } from 'nestjs-axios-undici';
import { createAuthInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  it('adds the Authorization header', async () => {
    const next: HttpInterceptorHandler = {
      handle: jest.fn().mockReturnValue(of({ data: 'ok', status: 200 })),
    };
    const request: HttpInterceptorRequest = { url: 'https://api.example.com', options: { headers: {} } };

    await lastValueFrom(createAuthInterceptor('token')(request, next));

    expect(next.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      }),
    );
  });
});
```

Class interceptors with dependencies can be created through a testing module:

```typescript
describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: LoggerService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [LoggingInterceptor, LoggerService],
    }).compile();

    interceptor = module.get(LoggingInterceptor);
    logger = module.get(LoggerService);
  });

  it('logs requests', async () => {
    const spy = jest.spyOn(logger, 'log');
    const next = { handle: jest.fn().mockReturnValue(of({ data: 'ok', status: 200 })) };

    await lastValueFrom(interceptor.intercept({ url: '/test', options: {} }, next));

    expect(spy).toHaveBeenCalledWith('Request to /test');
  });
});
```

To test an interceptor together with the real `HttpService`, register it on `HttpModule` with a `MockAgent` dispatcher, as shown above.
