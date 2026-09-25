import type { Dispatcher } from 'undici';
import type { UrlObject } from 'node:url';

export type UndiciResponseDataType = Promise<Dispatcher.ResponseData>;

export type UndiciRequestOptionsType = {
  dispatcher?: Dispatcher;
} & Omit<Dispatcher.RequestOptions<any>, 'origin' | 'path' | 'method'> &
  Partial<any>;

export type UndiciURLType = string | URL | UrlObject;

export type UndiciRequestArgsType = {
  url: UndiciURLType;
  options?: UndiciRequestOptionsType;
};

export type UndiciRequestType = (
  args: UndiciRequestArgsType,
) => UndiciResponseDataType;

import type { Type, DynamicModule } from '@nestjs/common';
import type { HttpInterceptor, HttpInterceptorFunction } from '../interfaces';

/**
 * A `tough-cookie` `CookieJar` instance, typed structurally loose (not
 * imported from `tough-cookie`) so `HttpModuleOptions` type-checks without
 * the `tough-cookie` types installed - `tough-cookie` and `http-cookie-agent`
 * are optional peers, only required at runtime when `cookieJar` is actually
 * set (see `HttpService.setupDispatcher`/`package.json`).
 */
export type CookieJarOption = object;

export type HttpModuleOptions = UndiciRequestOptionsType & {
  interceptors?: Array<
    Type<HttpInterceptor> | HttpInterceptor | HttpInterceptorFunction
  >;
  /**
   * Opts into cookie storage/replay, unlike axios (which ignores
   * `withCredentials` on Node.js and has no cookie jar of its own). Pass a
   * `tough-cookie` `CookieJar` instance; the module wraps whatever
   * dispatcher it built (proxy/TLS/socketPath) in an `http-cookie-agent`
   * `CookieAgent` around that jar.
   *
   * - Only an instance is accepted, never `true`: the caller owns the jar's
   *   scope explicitly (module-wide, per-request, per-user, ...), so cookies
   *   are never shared between callers unless the caller chooses to share
   *   the jar itself. This is what makes `withCredentials` a no-op instead -
   *   see `docs/axios-supported-options.md`.
   * - Module-level only; there's no per-request `cookieJar` (building a
   *   `CookieAgent` per jar per request would be expensive, and cheap
   *   caching would need to key on jar identity forever - a `WeakMap` per
   *   `HttpService` would work but isn't implemented). Pass different
   *   `cookieJar`s to different `HttpModule.register()` calls instead.
   * - `http-cookie-agent` and `tough-cookie` are optional peer dependencies,
   *   loaded lazily the first time a `cookieJar` is configured; install both
   *   (`npm i http-cookie-agent tough-cookie`) to use this option.
   */
  cookieJar?: CookieJarOption;
};

export interface TypedDynamicModule<T> extends DynamicModule {
  module: Type<any>;
  providers: any[];
  exports: any[];
}
