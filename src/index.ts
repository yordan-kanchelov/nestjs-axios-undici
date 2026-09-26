/**
 * The public API (plan.md phase 3 "Trim the public API"): every barrel below
 * re-exports an explicit, deliberate list of names - never `export *` - so
 * nothing reaches a consumer just because some internal file happens to
 * declare `export`. See `docs/migration-guide.md` ("Public API trim") for
 * what was removed and its replacement, if any.
 */
export { HttpModule } from './modules/http/http.module';
export * from './modules/http/interfaces';
export * from './modules/http/constants';
export * from './modules/http/services';
export * from './modules/http/errors';
export * from './modules/http/types';
// `HttpService.dispatchAxiosConfig` (the bridge every axios-like instance
// `axiosRef`/`axiosRef.create()` builds dispatches a request through) is a
// public method, so its `context: AxiosInstanceContext` parameter's shape is
// already part of the public API surface, whether or not it's re-exported by
// name; exported explicitly here rather than left as an api-extractor
// "forgotten export".
export type { AxiosInstanceContext } from './modules/http/adapters/axios-ref.factory';
export type {
  AxiosInterceptorStore,
  AxiosInterceptorEntry,
} from './modules/http/adapters/axios-interceptor.adapter';
