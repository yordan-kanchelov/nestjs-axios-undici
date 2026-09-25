/**
 * Native interceptors
 *
 * Class-based and function-based interceptors registered on the module.
 * Class interceptors are resolved through Nest DI, so they can inject providers.
 */

import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { firstValueFrom, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  HttpInterceptor,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
  HttpModule,
  HttpService,
} from '../lib';

// `npm run test:examples` points this at a local echo server
const API =
  process.env.EXAMPLES_BASE_URL ?? 'https://jsonplaceholder.typicode.com';

// Adds auth headers to every request
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  intercept(
    request: HttpInterceptorRequest,
    next: HttpInterceptorHandler,
  ): Observable<any> {
    return next.handle({
      ...request,
      options: {
        ...request.options,
        headers: {
          ...(request.options.headers as Record<string, string>),
          authorization: 'Bearer fake-token',
          'x-custom-header': 'interceptor-added-this',
        },
      },
    });
  }
}

// Sees the axios-style response on the way back
@Injectable()
export class ResponseLoggingInterceptor implements HttpInterceptor {
  intercept(
    request: HttpInterceptorRequest,
    next: HttpInterceptorHandler,
  ): Observable<any> {
    return next
      .handle(request)
      .pipe(
        tap(response =>
          console.log(
            `🟢 ${request.url} -> ${response.status} ${response.statusText}`,
          ),
        ),
      );
  }
}

// Function-based interceptor that times each request
const timingInterceptor = (
  request: HttpInterceptorRequest,
  next: HttpInterceptorHandler,
) => {
  const start = Date.now();
  return next
    .handle(request)
    .pipe(
      tap(() => console.log(`⏱️  ${request.url} took ${Date.now() - start}ms`)),
    );
};

@Injectable()
export class ApiService {
  constructor(private readonly httpService: HttpService) {}

  getPost(id: number) {
    return firstValueFrom(this.httpService.get(`${API}/posts/${id}`));
  }
}

@Module({
  imports: [
    HttpModule.register({
      interceptors: [
        AuthInterceptor,
        ResponseLoggingInterceptor,
        timingInterceptor,
      ],
    }),
  ],
  providers: [ApiService],
})
class AppModule {}

export async function demonstrateInterceptors() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const response = await app.get(ApiService).getPost(1);
    console.log('✅ Response data:', response.data);

    // The local echo server returns the request headers it received
    if (process.env.EXAMPLES_BASE_URL) {
      const headers = response.data.headers ?? {};
      if (headers.authorization !== 'Bearer fake-token') {
        throw new Error('AuthInterceptor did not add the authorization header');
      }
      console.log('✅ AuthInterceptor added the authorization header');
    }
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  demonstrateInterceptors().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
