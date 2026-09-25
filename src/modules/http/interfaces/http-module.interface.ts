import type { Provider, ModuleMetadata, Type } from '@nestjs/common';
import type { HttpModuleOptions } from '../types/http-module.type';

export interface HttpModuleOptionsFactory {
  createHttpOptions(): Promise<HttpModuleOptions> | HttpModuleOptions;
}
export interface BodyMixin {
  readonly body?: never; // throws on node v16.6.0
  readonly bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  formData(): Promise<never>;
  json(): Promise<any>;
  text(): Promise<string>;
}
/**
 * `HttpModule.registerAsync()` options - shaped to accept `@nestjs/axios`'
 * own `HttpModuleAsyncOptions` value directly (plan.md phase 2 "types: axios
 * interop"). Exactly one of `useExisting`/`useClass`/`useFactory` must be
 * set; `HttpModule.registerAsync({})` throws a clear error at setup instead
 * of silently registering a provider with `provide: undefined` (the
 * `strict`-mode gap `plan/reports/package-quality.md` describes).
 */
export interface HttpModuleAsyncOptions extends Pick<
  ModuleMetadata,
  'imports'
> {
  useExisting?: Type<HttpModuleOptionsFactory>;
  useClass?: Type<HttpModuleOptionsFactory>;
  useFactory?: (
    ...args: any[]
  ) => Promise<HttpModuleOptions> | HttpModuleOptions;
  inject?: any[];
  extraProviders?: Provider[];
  /** Register the module as global, as in `@nestjs/axios` */
  global?: boolean;
}
