import { Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type {
  AxiosLikeResponse,
  HttpInterceptor,
  HttpInterceptorHandler,
  HttpInterceptorRequest,
} from 'nestjs-axios-undici';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(
    request: HttpInterceptorRequest,
    next: HttpInterceptorHandler
  ): Observable<AxiosLikeResponse> {
    const now = Date.now();
    const method = request.options.method || 'GET';
    const url = request.url.toString();

    this.logger.log(`Outgoing HTTP Request: ${method} ${url}`);

    // User interceptors wrap the built-in axios response adapter, so the
    // response here is already axios-compatible (`status`, `data`, ...).
    return next.handle(request).pipe(
      tap((response: AxiosLikeResponse) => {
        const duration = Date.now() - now;
        this.logger.log(
          `HTTP Response: ${method} ${url} - Status: ${response.status} - Duration: ${duration}ms`
        );
      })
    );
  }
}
