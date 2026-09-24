# Testing

You can test services that use `nestjs-undici-interceptors` either by mocking the `HttpService` directly or by using Undici's `MockAgent`.

## Mocking HttpService

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from 'nestjs-undici-interceptors';
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
import { HttpModule } from 'nestjs-undici-interceptors';
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
