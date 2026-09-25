// Compile-only: nestjs-axios-undici must be assignable everywhere
// @nestjs/axios types are expected -- the actual "drop-in" contract. A case
// that already holds is plain code; a case that doesn't yet hold is pinned
// with `@ts-expect-error` and a reason, so fixing it forces this file to be
// updated (the stale directive then fails to compile).
// Port of plan/prototypes/automation/differential/drop-in.types.ts (plan.md phase 1 item C).
import type {
  HttpService as RefHttpService,
  HttpModuleOptions as RefHttpModuleOptions,
  HttpModuleAsyncOptions as RefHttpModuleAsyncOptions,
} from '@nestjs/axios';
import type { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Observable } from 'rxjs';
import { HttpModule, HttpService } from '../../lib';

type PublicOf<T> = { [K in keyof T]: T[K] };

declare const ours: HttpService;

// Our HttpService should stand in for @nestjs/axios' HttpService wherever
// it's injected or typed. ('query', new in @nestjs/axios 12, is a separately
// tracked, allowlisted gap: see tests/compat/api-surface.spec.ts.)
// @ts-expect-error -- request()'s AxiosCompatibleRequestConfig isn't assignable from axios' AxiosRequestConfig (url must be string | URL, not string | undefined); tracked in plan.md phase 2 "types: axios interop"
export const asRefHttpService: Omit<PublicOf<RefHttpService>, 'query'> = ours;

// axiosRef should be usable as a plain axios AxiosInstance.
// @ts-expect-error -- axiosRef isn't a real axios instance yet: not callable, and missing create/getUri/*Form/query; tracked in plan.md phase 2 "feat(axiosRef): make it a real axios instance"
export const axiosRefAsAxiosInstance: AxiosInstance = ours.axiosRef;

// A variable typed with axios' own AxiosRequestConfig should be a valid
// second argument to get(), and the call's return type should be assignable
// to Observable<AxiosResponse<T>>, as code written against @nestjs/axios expects.
declare const axiosStyleConfig: AxiosRequestConfig;
export function getWithAxiosConfig(): Observable<
  AxiosResponse<{ id: number }>
> {
  // @ts-expect-error -- our request options / response headers aren't yet assignable from/to axios' AxiosRequestConfig / AxiosResponse; tracked in plan.md phase 2 "types: axios interop"
  return ours.get<{ id: number }>('/x', axiosStyleConfig);
}

// The same options object accepted by @nestjs/axios' HttpModule.register()
// should be accepted by ours.
declare const refModuleOptions: RefHttpModuleOptions;
HttpModule.register(refModuleOptions);

// ...and HttpModuleAsyncOptions by registerAsync().
declare const refModuleAsyncOptions: RefHttpModuleAsyncOptions;
// @ts-expect-error -- our HttpModuleAsyncOptions/HttpModuleOptions aren't structurally identical to @nestjs/axios'; tracked in plan.md phase 2 "types: axios interop" (typed HttpModuleOptions)
HttpModule.registerAsync(refModuleAsyncOptions);
