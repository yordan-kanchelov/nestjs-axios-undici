import { format as formatUrl } from 'node:url';
import type { UrlObject } from 'node:url';

/**
 * axios/follow-redirects' default: up to 21 redirects are followed
 * automatically when `maxRedirects` isn't set anywhere. `maxRedirects: 0`
 * (the only value that disables following) is handled by the caller, not
 * here.
 */
export const DEFAULT_MAX_REDIRECTS = 21;

const CONTENT_HEADER_RE = /^content-/i;
const SENSITIVE_REDIRECT_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

export type UrlLike = string | URL | UrlObject;

/** Renders any of the 3 URL shapes `HttpService` dispatches with into a string. */
export function urlToString(url: UrlLike): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return formatUrl(url as UrlObject);
}

/**
 * True for a 3xx response that carries a `Location` header - the only shape
 * that can redirect. Cheap on purpose: this runs on every response.
 */
export function isRedirectResponse(
  statusCode: number,
  location: string | string[] | undefined,
): boolean {
  return statusCode >= 300 && statusCode < 400 && !!location;
}

function firstHeaderValue(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

/** Returns `headers` unchanged when nothing matches (no copy on the common case). */
function removeHeaders(
  headers: Record<string, any>,
  test: (lowerName: string) => boolean,
): Record<string, any> {
  let out: Record<string, any> | undefined;
  for (const key of Object.keys(headers)) {
    if (test(key.toLowerCase())) {
      out ??= { ...headers };
      delete out[key];
    }
  }
  return out ?? headers;
}

/** follow-redirects' `isSubdomain`: `subdomain` ends with `.` + `domain`. */
function isSubdomain(subdomain: string, domain: string): boolean {
  const dot = subdomain.length - domain.length - 1;
  return dot > 0 && subdomain[dot] === '.' && subdomain.endsWith(domain);
}

/**
 * follow-redirects' exact cross-boundary rule for dropping `Authorization` /
 * `Cookie` / `Proxy-Authorization`: strip them when the protocol changes to
 * something other than `https:` (a downgrade, or a scheme change that isn't
 * an upgrade to https), OR when the host (hostname **and** port) changes to
 * something that isn't a subdomain of the previous host. A different port on
 * the same hostname counts as a different host - it is not a subdomain of
 * itself, so the headers are dropped.
 */
export function shouldStripSensitiveHeaders(
  currentUrl: URL,
  redirectUrl: URL,
): boolean {
  const protocolChanged = redirectUrl.protocol !== currentUrl.protocol;
  const hostChanged = redirectUrl.host !== currentUrl.host;
  return (
    (protocolChanged && redirectUrl.protocol !== 'https:') ||
    (hostChanged && !isSubdomain(redirectUrl.host, currentUrl.host))
  );
}

/** axios `beforeRedirect(options, responseDetails, requestDetails)`. */
export type BeforeRedirect = (
  options: Record<string, any>,
  responseDetails: { headers: Record<string, any>; statusCode: number },
  requestDetails: {
    url: string;
    method: string;
    headers: Record<string, any>;
  },
) => void;

export interface RedirectHopInput {
  /** The absolute URL the just-completed request was sent to. */
  currentUrl: string;
  /** The response's `Location` header. */
  location: string | string[];
  statusCode: number;
  method: string;
  headers: Record<string, any>;
  body: any;
  /** The just-completed response's headers, for `beforeRedirect`'s `responseDetails`. */
  responseHeaders: Record<string, any>;
  beforeRedirect?: BeforeRedirect;
}

export interface RedirectHopResult {
  url: URL;
  method: string;
  headers: Record<string, any>;
  body: any;
}

function isStreamLike(value: any): boolean {
  return (
    !!value && typeof value === 'object' && typeof value.pipe === 'function'
  );
}

/**
 * axios/follow-redirects buffer the request body as it's written, so it can
 * be replayed on a redirect that keeps it (307/308, or any non-POST 301/302,
 * or a GET/HEAD 303). This package hands the body straight to undici and
 * never buffers it, so a Node.js `Readable` (a real stream, not a `Buffer`/
 * string/`FormData`) can't be resent once the first hop has already started
 * reading it - see docs/axios-supported-options.md.
 */
export function createStreamRedirectError(): Error & { code: string } {
  const error = new Error(
    'Cannot resend a streamed request body on a redirect that keeps it ' +
      '(307/308, or a non-POST redirect). Buffer the body yourself (e.g. ' +
      'read the stream into a Buffer) before sending it, or set ' +
      '`maxRedirects: 0` and follow the redirect manually.',
  ) as Error & { code: string };
  error.code = 'ERR_FR_REDIRECTION_FAILURE';
  return error;
}

/**
 * Builds the next request for one redirect hop: resolves a relative
 * `Location` against `currentUrl`, applies axios/follow-redirects' method-
 * and-body rules (301/302 turn POST into GET, 303 turns anything but HEAD
 * into GET, 307/308 keep both), drops the `Host` header and - when the body
 * was dropped - the `Content-*` headers, drops `Authorization`/`Cookie`/
 * `Proxy-Authorization` across a protocol downgrade or host change, and
 * finally runs `beforeRedirect` (if configured), whose mutations of
 * `options.headers`/`.method`/`.protocol`/`.hostname`/`.port`/`.path` are
 * reflected in the result, exactly as follow-redirects applies them.
 */
export function buildRedirectHop(input: RedirectHopInput): RedirectHopResult {
  const currentUrl = new URL(input.currentUrl);
  const location = firstHeaderValue(input.location);
  const redirectUrl = new URL(location, currentUrl);

  const upperMethod = input.method.toUpperCase();
  const dropBody =
    ((input.statusCode === 301 || input.statusCode === 302) &&
      upperMethod === 'POST') ||
    (input.statusCode === 303 &&
      upperMethod !== 'GET' &&
      upperMethod !== 'HEAD');

  let method = dropBody ? 'GET' : input.method;
  const body = dropBody ? undefined : input.body;

  if (!dropBody && isStreamLike(body)) {
    throw createStreamRedirectError();
  }

  let headers = dropBody
    ? removeHeaders(input.headers, key => CONTENT_HEADER_RE.test(key))
    : input.headers;
  headers = removeHeaders(headers, key => key === 'host');

  if (shouldStripSensitiveHeaders(currentUrl, redirectUrl)) {
    headers = removeHeaders(headers, key =>
      SENSITIVE_REDIRECT_HEADERS.has(key),
    );
  }

  let finalUrl = redirectUrl;
  if (input.beforeRedirect) {
    const brOptions: Record<string, any> = {
      protocol: redirectUrl.protocol,
      hostname: redirectUrl.hostname,
      port: redirectUrl.port,
      path: redirectUrl.pathname + redirectUrl.search,
      method,
      headers,
    };
    input.beforeRedirect(
      brOptions,
      { headers: input.responseHeaders, statusCode: input.statusCode },
      { url: input.currentUrl, method: input.method, headers: input.headers },
    );
    method = brOptions.method ?? method;
    headers = brOptions.headers ?? headers;
    const port = brOptions.port ? `:${brOptions.port}` : '';
    finalUrl = new URL(
      `${brOptions.protocol}//${brOptions.hostname}${port}${brOptions.path ?? ''}`,
    );
  }

  return { url: finalUrl, method, headers, body };
}

/**
 * axios/follow-redirects' error for exceeding `maxRedirects`: a request-level
 * error with no `response` (matches follow-redirects emitting it as an
 * `'error'` event rather than a `'response'` one, which axios' Node adapter
 * turns into `AxiosError.from(err, null, config, req)` - no response).
 */
export function createTooManyRedirectsError(): Error & { code: string } {
  const error = new Error('Maximum number of redirects exceeded') as Error & {
    code: string;
  };
  error.code = 'ERR_FR_TOO_MANY_REDIRECTS';
  return error;
}

/**
 * Discards a redirected-away-from response's body, matching follow-redirects'
 * `response.destroy()`: undici's `dump()` reads-and-discards without holding
 * the data, falling back to `destroy()` on an older body shape. Best-effort -
 * the body is being thrown away either way, so a failure here never fails
 * the redirect.
 */
export async function dumpRedirectBody(body: any): Promise<void> {
  if (!body) return;
  try {
    if (typeof body.dump === 'function') {
      await body.dump();
      return;
    }
    if (typeof body.destroy === 'function') {
      body.destroy();
    }
  } catch {
    // best-effort
  }
}
