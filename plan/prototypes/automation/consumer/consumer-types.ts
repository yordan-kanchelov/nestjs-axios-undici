// Type-level consumer check: compiled with tsc --noEmit against the installed tarball.
import { Injectable, Module } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import {
  HttpModule, HttpService, HttpModuleOptionsFactory, HttpInterceptor,
  HttpInterceptorHandler, HttpInterceptorRequest, AxiosError, isAxiosError,
} from 'nestjs-axios-undici';

@Injectable()
class Auth implements HttpInterceptor {
  intercept(req: HttpInterceptorRequest, next: HttpInterceptorHandler) { return next.handle(req); }
}
@Injectable()
class Options implements HttpModuleOptionsFactory {
  createHttpOptions() { return { baseURL: 'http://x', timeout: 1000, interceptors: [Auth] }; }
}
@Module({ imports: [HttpModule.register({ baseURL: 'http://x' }), HttpModule.registerAsync({ useClass: Options })] })
export class AppModule {}

@Injectable()
export class Client {
  constructor(private readonly http: HttpService) {}
  async run() {
    const r = await firstValueFrom(this.http.get<{ id: number }>('/a', { params: { q: 1 }, timeout: 5 }));
    const id: number = r.data.id;
    const s: number = r.status;
    this.http.axiosRef.interceptors.request.use(c => c);
    await this.http.axiosRef.post<{ ok: boolean }>('/b', { a: 1 });
    try { await firstValueFrom(this.http.post('/c', {})); } catch (e) {
      if (isAxiosError(e)) { const code: string | undefined = e.code; void code; }
      if (e instanceof AxiosError) void e.response?.status;
    }
    return id + s;
  }
}
