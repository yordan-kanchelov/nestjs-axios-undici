// Typical @nestjs/axios consumer code. `__PKG__` is replaced by '@nestjs/axios' or 'nestjs-axios-undici'.
// Each numbered case must compile against BOTH packages for a true drop-in.
import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { HttpModule, HttpService, HttpModuleOptionsFactory, HttpModuleOptions } from '__PKG__';
import type { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { Observable, firstValueFrom, of, map, catchError, throwError } from 'rxjs';

interface User { id: number; name: string }
interface CreateUserDto { name: string }

@Module({ imports: [HttpModule.register({ baseURL: 'http://x', timeout: 5000, maxRedirects: 5, global: true })] })
export class M1 {}

@Injectable()
export class OptionsFactory implements HttpModuleOptionsFactory {
  createHttpOptions(): HttpModuleOptions { return { timeout: 1000, headers: { 'X-A': '1' } }; }
}
@Module({ imports: [HttpModule.registerAsync({ useClass: OptionsFactory }), HttpModule.registerAsync({ useFactory: async () => ({ baseURL: 'http://x', timeout: 1 }), inject: [] })] })
export class M2 {}

@Injectable()
export class UsersService {
  constructor(private readonly http: HttpService) {}

  // case1: pipe(map(r => r.data)) keeps T
  case1(): Observable<User[]> { return this.http.get<User[]>('/users').pipe(map(r => r.data)); }
  // case2: firstValueFrom + destructure with config
  async case2(dto: CreateUserDto): Promise<User> {
    const { data } = await firstValueFrom(this.http.post<User>('/users', dto, { headers: { Authorization: 'x' }, params: { a: 1 }, timeout: 10 }));
    return data;
  }
  // case3: request(config)
  case3() { return this.http.request<User>({ url: '/u', method: 'GET' }); }
  // case4: second generic D (request body type), supported by @nestjs/axios
  case4(dto: CreateUserDto) { return this.http.post<User, CreateUserDto>('/users', dto); }
  // case5: return type annotated with axios' AxiosResponse
  case5(): Observable<AxiosResponse<User>> { return this.http.get<User>('/u'); }
  // case6: catchError typed with axios' AxiosError
  case6() { return this.http.get<User>('/u').pipe(catchError((e: AxiosError) => throwError(() => e.response?.status))); }
  // case7: axiosRef request interceptor mutating headers (strict: headers must be non-optional)
  case7() {
    this.http.axiosRef.interceptors.request.use(config => { config.headers['Authorization'] = 'Bearer x'; return config; });
  }
  // case8: axiosRef interceptor using AxiosHeaders#set (common in axios >= 1)
  case8() {
    this.http.axiosRef.interceptors.request.use(config => { config.headers.set('X-Trace', '1'); return config; });
  }
  // case9: interceptor callback annotated with axios' InternalAxiosRequestConfig
  case9() {
    this.http.axiosRef.interceptors.request.use((config: InternalAxiosRequestConfig) => config);
  }
  // case10: axiosRef promise API returns Promise<AxiosResponse<T>>
  async case10(): Promise<User> { const r = await this.http.axiosRef.get<User>('/u'); return r.data; }
  // case11: axiosRef.defaults
  case11() { this.http.axiosRef.defaults.headers.common['Authorization'] = 'x'; this.http.axiosRef.defaults.timeout = 1000; }
  // case12: response.headers access
  async case12() { const r = await firstValueFrom(this.http.get('/u')); const ct: string | undefined = r.headers['content-type'] as string; return ct; }
  // case13: response interceptor with typed AxiosError
  case13() { this.http.axiosRef.interceptors.response.use(r => r, (e: AxiosError) => Promise.reject(e)); }
  // case14: per-request options
  case14(signal: AbortSignal) { return this.http.get<ArrayBuffer>('/f', { responseType: 'arraybuffer', signal, validateStatus: () => true, maxRedirects: 0 }); }
}

// case15: unit-test style mock (extremely common): of({...} as AxiosResponse)
export function case15(http: HttpService) {
  const res: AxiosResponse<User> = { data: { id: 1, name: 'a' }, status: 200, statusText: 'OK', headers: {}, config: {} as InternalAxiosRequestConfig };
  const spy: (url: string) => ReturnType<HttpService['get']> = () => of(res);
  return spy;
}
// case16: typos in module options are rejected (HttpModuleOptions is not `any`)
// @ts-expect-error -- 'timeuot' is not an option
export const case16: HttpModuleOptions = { timeuot: 5 };
