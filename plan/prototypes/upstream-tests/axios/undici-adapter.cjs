// Strategy (b): an axios `adapter` function backed by this package's own
// transport/response/error code (not its interceptor/config-normalization
// pipeline, and not axiosRef). Required with PROTOTYPE_REPO_LIB_DIR set to
// this repo's built `lib/modules/http` directory (see run.mjs).
//
// Contract reminder (lib/core/dispatchRequest.js in the axios under test):
// by the time `adapter(config)` runs, axios has already applied
// `transformRequest` (config.data is the final wire body) and merged
// defaults into `config`; the adapter must build the full URL itself
// (baseURL + url) and return `{ data, status, statusText, headers, config,
// request }` with `data` still UNTRANSFORMED (axios applies
// `transformResponse` afterwards) - exactly the shape `toAxiosLikeResponse`
// below already produces for HttpService's own response path.
'use strict';

const { request: undiciRequest } = require('undici');

const LIB_DIR = process.env.PROTOTYPE_REPO_LIB_DIR;
if (!LIB_DIR) {
  throw new Error('undici-adapter: PROTOTYPE_REPO_LIB_DIR env var not set');
}
const path = require('node:path');
const { toAxiosLikeResponse } = require(
  path.join(LIB_DIR, 'adapters', 'axios-response.adapter.js'),
);
const { toAxiosError } = require(path.join(LIB_DIR, 'errors', 'axios-error.js'));
const {
  DEFAULT_MAX_REDIRECTS,
  isRedirectResponse,
  buildRedirectHop,
  createTooManyRedirectsError,
  dumpRedirectBody,
  urlToString,
} = require(path.join(LIB_DIR, 'adapters', 'redirect.adapter.js'));

// Same helper the axios instance under test uses to combine baseURL + url,
// required from wherever the caller's own axios checkout lives, so the
// adapter matches that axios version's own url-building rules exactly.
function makeAdapter({ buildFullPath }) {
  return async function undiciAdapter(config) {
    const headers = config.headers?.toJSON
      ? config.headers.toJSON()
      : { ...config.headers };
    const fullPath = buildFullPath(
      config.baseURL,
      config.url,
      config.allowAbsoluteUrls,
      config,
    );

    // Real axios's http adapter listens to the legacy `cancelToken.promise`
    // alongside `config.signal`; without this, a test using only
    // `CancelToken` (not `AbortController`) hangs until the vitest test
    // timeout, and its server is never closed - see the report's "harness
    // limitation" note on the cancel-token cascade.
    let signal = config.signal;
    if (config.cancelToken) {
      const controller = new AbortController();
      if (config.signal) {
        config.signal.addEventListener('abort', () => controller.abort(config.signal.reason));
      }
      config.cancelToken.promise.then(
        (reason) => controller.abort(reason),
        () => {},
      );
      signal = controller.signal;
    }

    const interceptorRequest = {
      url: fullPath,
      options: {
        maxContentLength:
          config.maxContentLength > -1 ? config.maxContentLength : undefined,
        responseType: config.responseType,
        decompress: config.decompress !== false,
        validateStatus:
          config.validateStatus === null ? () => true : config.validateStatus,
        signal,
      },
    };

    let currentUrl = fullPath;
    let currentOptions = {
      method: (config.method || 'get').toUpperCase(),
      headers,
      body: config.data,
    };
    let redirectCount = 0;
    const maxRedirects =
      config.maxRedirects === undefined ? DEFAULT_MAX_REDIRECTS : config.maxRedirects;
    let finalUrl;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const dispatchOptions = {
          method: currentOptions.method,
          headers: currentOptions.headers,
          body: currentOptions.body,
          signal,
        };
        if (config.timeout) {
          dispatchOptions.headersTimeout = config.timeout;
          dispatchOptions.bodyTimeout = config.timeout;
        }
        const res = await undiciRequest(currentUrl, dispatchOptions);
        const location = res.headers.location;

        if (isRedirectResponse(res.statusCode, location) && maxRedirects !== 0) {
          redirectCount++;
          if (redirectCount > maxRedirects) {
            await dumpRedirectBody(res.body);
            throw createTooManyRedirectsError();
          }
          const hop = buildRedirectHop({
            currentUrl: urlToString(currentUrl),
            location,
            statusCode: res.statusCode,
            method: currentOptions.method,
            headers: currentOptions.headers,
            body: currentOptions.body,
            responseHeaders: res.headers,
            beforeRedirect: config.beforeRedirect,
          });
          await dumpRedirectBody(res.body);
          currentUrl = hop.url;
          currentOptions = { method: hop.method, headers: hop.headers, body: hop.body };
          continue;
        }

        if (redirectCount > 0) finalUrl = urlToString(currentUrl);
        const axiosLikeResponse = await toAxiosLikeResponse(
          interceptorRequest,
          res,
          finalUrl,
        );
        axiosLikeResponse.config = config;
        return axiosLikeResponse;
      }
    } catch (error) {
      const err = toAxiosError(error, interceptorRequest);
      // Our error/response objects build `.config` lazily from the minimal
      // `interceptorRequest` above (no axiosConfig set), which isn't the
      // real axios `config` object real axios code downstream expects
      // (dispatchRequest re-runs `transformResponse` against
      // `reason.response`, and callers read `error.config`) - override with
      // the real one axios's own http adapter would have set.
      if (err && typeof err === 'object') {
        err.config = config;
        if (err.response) err.response.config = config;
      }
      throw err;
    }
  };
}

module.exports = { makeAdapter };
