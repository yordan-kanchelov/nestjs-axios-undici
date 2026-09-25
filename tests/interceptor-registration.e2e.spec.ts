import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { firstValueFrom, Observable } from 'rxjs';
import {
  HttpInterceptor,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
  HttpModule,
  HttpService,
} from '../src';
import { JsonServer, startJsonServer } from './test-helpers/json-server';

@Injectable()
class TokenService {
  getToken() {
    return 'token-from-di';
  }
}

@Module({ providers: [TokenService], exports: [TokenService] })
class TokenModule {}

@Injectable()
class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly tokens: TokenService) {}

  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler): Observable<any> {
    request.options.headers = {
      ...(request.options.headers as Record<string, string>),
      authorization: `Bearer ${this.tokens.getToken()}`,
    };
    return next.handle(request);
  }
}

class HeaderInterceptor implements HttpInterceptor {
  constructor(private readonly value: string) {}

  intercept(request: HttpInterceptorRequest, next: HttpInterceptorHandler): Observable<any> {
    request.options.headers = {
      ...(request.options.headers as Record<string, string>),
      'x-instance': this.value,
    };
    return next.handle(request);
  }
}

describe('Interceptor registration', () => {
  let server: JsonServer;
  let seenHeaders: Record<string, string | string[] | undefined>;

  beforeAll(async () => {
    server = await startJsonServer(req => {
      seenHeaders = req.headers;
    });
  });

  afterAll(() => server.close());

  beforeEach(() => {
    seenHeaders = {};
  });

  it('registerAsync resolves class interceptors with dependencies from imports', async () => {
    const module = await Test.createTestingModule({
      imports: [
        HttpModule.registerAsync({
          imports: [TokenModule],
          useFactory: () => ({ interceptors: [AuthInterceptor] }),
        }),
      ],
    }).compile();

    await firstValueFrom(module.get(HttpService).get(`${server.baseUrl}/posts/1`));

    expect(seenHeaders.authorization).toBe('Bearer token-from-di');
  });

  it('registerAsync resolves class interceptor dependencies from extraProviders', async () => {
    const module = await Test.createTestingModule({
      imports: [
        HttpModule.registerAsync({
          useFactory: () => ({ interceptors: [AuthInterceptor] }),
          extraProviders: [TokenService],
        }),
      ],
    }).compile();

    await firstValueFrom(module.get(HttpService).get(`${server.baseUrl}/posts/1`));

    expect(seenHeaders.authorization).toBe('Bearer token-from-di');
  });

  it.each([
    ['register', () => HttpModule.register({ interceptors: [new HeaderInterceptor('register')] })],
    [
      'registerAsync',
      () =>
        HttpModule.registerAsync({
          useFactory: () => ({ interceptors: [new HeaderInterceptor('registerAsync')] }),
        }),
    ],
  ])('%s accepts interceptor instances', async (method, createModule) => {
    const module = await Test.createTestingModule({ imports: [createModule()] }).compile();

    await firstValueFrom(module.get(HttpService).get(`${server.baseUrl}/posts/1`));

    expect(seenHeaders['x-instance']).toBe(method);
  });
});
