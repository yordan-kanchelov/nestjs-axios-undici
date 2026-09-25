// Compile-only: nestjs-axios-undici must be assignable where @nestjs/axios types are expected.
import type { HttpService as RefService, HttpModuleOptions as RefOptions, HttpModuleAsyncOptions as RefAsync } from '@nestjs/axios';
import type { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import type { Observable } from 'rxjs';
import { HttpModule, HttpService } from '../../src';

type PublicOf<T> = { [K in keyof T]: T[K] };
declare const ours: HttpService;
export const asRef: Omit<PublicOf<RefService>, never> = ours;              // whole public surface
export const axiosRef: AxiosInstance = ours.axiosRef;                       // axiosRef usable as AxiosInstance
declare const cfg: AxiosRequestConfig;
export const get: Observable<AxiosResponse<{ id: number }>> = ours.get<{ id: number }>('/x', cfg);
declare const refOpts: RefOptions; declare const refAsync: RefAsync;
HttpModule.register(refOpts);                                               // same options object compiles
HttpModule.registerAsync(refAsync);
