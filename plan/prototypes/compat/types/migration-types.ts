// Type-level migration check: typical @nestjs/axios user code compiled against nestjs-axios-undici.
// Run: npx tsc --noEmit -p tests/diff/types/tsconfig.json
import { AxiosError, AxiosRequestConfig, AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import { firstValueFrom, map, Observable } from 'rxjs';
import { HttpService } from '../../../src';

type User = { id: number };
declare const http: HttpService;

export async function a1(): Promise<AxiosResponse<User>> {
  return firstValueFrom(http.get<User>('/u'));                              // (1) AxiosResponse assignability
}
export function a2(): Observable<User> {
  return http.get<User>('/u').pipe(map(r => r.data));
}
export async function a3(cfg: AxiosRequestConfig) {
  await firstValueFrom(http.get('/u', cfg));                                // (2) AxiosRequestConfig accepted
  await firstValueFrom(http.request<User>({ ...cfg, url: '/u' }));
  await firstValueFrom(http.post('/u', { a: 1 }, cfg));
}
export async function a4(headers: RawAxiosRequestHeaders) {
  await firstValueFrom(http.get('/u', { headers, signal: new AbortController().signal }));
}
export function a5() {
  http.axiosRef.interceptors.request.use(config => {                        // (3) InternalAxiosRequestConfig-like
    config.headers.setAuthorization?.('Bearer x');
    config.headers['X-Id'] = '1';
    return config;
  });
  http.axiosRef.interceptors.response.use(r => r, (e: AxiosError) => Promise.reject(e));
}
export async function a6() {
  try {
    await firstValueFrom(http.get('/u'));
  } catch (e) {
    if (e instanceof AxiosError) console.log(e.response?.status);
  }
}
export function a7(): Promise<AxiosResponse> {
  return http.axiosRef.get('/u');
}
