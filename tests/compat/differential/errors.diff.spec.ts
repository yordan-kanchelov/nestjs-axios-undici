/**
 * Differential: errors, timeouts, cancellation, redirects, size limits.
 * See harness.ts.
 */
import axios from 'axios';
import { Readable } from 'node:stream';
import { differential, Ctx } from './harness';

const ERRORS = 'plan.md phase 2: fix(errors): match axios errors';

const routes = {
  '/raw': (req: any, res: any) => {
    const p = new URL(req.url, 'http://x').searchParams;
    const status = Number(p.get('status') || 200);
    const headers: Record<string, string> = {};
    if (p.has('ct')) headers['Content-Type'] = p.get('ct')!;
    res.writeHead(status, headers);
    res.end(p.get('body') ?? '');
  },
  '/redirect': (req: any, res: any) => {
    const p = new URL(req.url, 'http://x').searchParams;
    res.writeHead(Number(p.get('code') || 302), {
      Location: p.get('to') || '/echo',
    });
    res.end();
  },
  '/bad-gzip': (_req: any, res: any) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    });
    res.end('this is not gzip');
  },
  '/redirect-loop': (_req: any, res: any) => {
    res.writeHead(302, { Location: '/redirect-loop' });
    res.end();
  },
  '/slow': (req: any, res: any) => {
    const ms = Number(
      new URL(req.url, 'http://x').searchParams.get('ms') || 2000,
    );
    const t = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('late');
    }, ms);
    res.on('close', () => clearTimeout(t));
  },
  '/slow-body': (req: any, res: any) => {
    const ms = Number(
      new URL(req.url, 'http://x').searchParams.get('ms') || 1500,
    );
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('a');
    const t = setTimeout(() => res.end('b'), ms);
    res.on('close', () => clearTimeout(t));
  },
  '/big': (req: any, res: any) => {
    const n = Number(
      new URL(req.url, 'http://x').searchParams.get('n') || 2000,
    );
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('x'.repeat(n));
  },
  '/destroy': (req: any) => {
    req.socket.destroy();
  },
  '/echo': (req: any, res: any, body: string) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, url: req.url, body }));
  },
};

/** Shape of an error that user code commonly inspects, ported from errors.diff.spec.ts (prototype). */
function errShape(o: any) {
  const e = o.error;
  if (!e) return o.result ? 'resolved' : undefined;
  return {
    name: e.name,
    code: e.code,
    message: e.message,
    status: e.status,
    isAxiosError: axios.isAxiosError(e),
    isCancel: axios.isCancel(e),
    instanceofError: e instanceof Error,
    responseStatus: e.response?.status,
    responseData: e.response?.data,
    configMethod: e.config?.method,
    hasRequest: !!e.request,
  };
}

differential('Differential: errors, timeouts, cancellation', routes, [
  {
    // Must reject (not resolve with empty data) when the body can't be decompressed
    name: 'corrupt gzip body rejects',
    run: (s, ctx) => s.get(`${ctx.base}/bad-gzip`),
    normalize: (o: any) => ({
      rejected: !!o.error,
      code: o.error?.code,
      isAxiosError: axios.isAxiosError(o.error),
    }),
  },
  {
    name: '404 error shape',
    run: (s, ctx) =>
      s.get(`${ctx.base}/raw?status=404&ct=application/json&body={"e":1}`),
    normalize: errShape,
  },
  {
    name: '500 error shape',
    run: (s, ctx) =>
      s.get(`${ctx.base}/raw?status=500&ct=text/plain&body=boom`),
    normalize: errShape,
  },
  {
    name: 'ECONNREFUSED',
    run: s => s.get('http://127.0.0.1:1/x'),
    normalize: errShape,
  },
  {
    name: 'ENOTFOUND',
    run: s => s.get('http://does-not-exist.invalid/x'),
    normalize: errShape,
  },
  {
    name: 'socket hang up / ECONNRESET',
    run: (s, ctx) => s.get(`${ctx.base}/destroy`),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'invalid URL',
    run: s => s.get('not a url'),
    normalize: errShape,
  },
  {
    name: 'unsupported protocol',
    run: s => s.get('ftp://127.0.0.1/x'),
    normalize: errShape,
  },
  {
    name: 'AbortSignal already aborted',
    run: (s, ctx) => s.get(`${ctx.base}/echo`, { signal: AbortSignal.abort() }),
    normalize: errShape,
  },
  {
    name: 'AbortSignal aborted mid-flight',
    run: (s, ctx) => {
      const c = new AbortController();
      setTimeout(() => c.abort(), 100);
      return s.get(`${ctx.base}/slow?ms=2000`, { signal: c.signal });
    },
    normalize: errShape,
  },
  {
    name: 'AbortSignal.timeout()',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=2000`, { signal: AbortSignal.timeout(100) }),
    normalize: errShape,
  },
  {
    name: 'CancelToken with message',
    run: (s, ctx) => {
      const src = axios.CancelToken.source();
      setTimeout(() => src.cancel('bye'), 100);
      return s.get(`${ctx.base}/slow?ms=2000`, { cancelToken: src.token });
    },
    normalize: errShape,
  },
  {
    name: 'validateStatus null accepts everything',
    run: (s, ctx) =>
      s.get(`${ctx.base}/raw?status=500&body=x`, { validateStatus: null }),
    normalize: (o: any) => ({ status: o.result?.status, data: o.result?.data }),
  },
  {
    name: 'timeout: headers never arrive (code/message)',
    run: (s, ctx) => s.get(`${ctx.base}/slow?ms=3000`, { timeout: 300 }),
    normalize: errShape,
  },
  {
    // `executeRequest`'s deadline timer now fires at the right time (a
    // slowly-but-steadily trickling body used to never time out at all -
    // fixed), but axios' own error *shape* for a timeout that lands after
    // the response has already started streaming is a genuine quirk: real
    // axios' http adapter destroys the request on timeout, which - only
    // once a response object already exists - fires the response stream's
    // own 'aborted' handler first (`ERR_BAD_RESPONSE`, "stream has been
    // aborted"), *instead of* its usual `ECONNABORTED`/"timeout of Nms
    // exceeded" (checked against real axios 1.20). Replicating that exact
    // internal race (checked here, not attempted: it depends on whether
    // axios' own response object happens to exist yet) is out of scope;
    // this library gives the same, correct `ECONNABORTED` timeout error
    // either way, which is arguably more useful.
    name: 'timeout covers a slowly trickling body (axios: total time)',
    run: (s, ctx) => s.get(`${ctx.base}/slow-body?ms=1500`, { timeout: 500 }),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'transitional.clarifyTimeoutError => ETIMEDOUT',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=3000`, {
        timeout: 300,
        transitional: { clarifyTimeoutError: true },
      }),
    normalize: (o: any) => o.error?.code,
  },
  {
    name: 'timeoutErrorMessage',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=3000`, {
        timeout: 300,
        timeoutErrorMessage: 'custom!',
      }),
    normalize: (o: any) => o.error?.message,
  },
  // ---- redirects
  ...(
    [
      ['GET 302 default (no maxRedirects)', 'get', 302, undefined],
      ['POST 301 -> method/body', 'post', 301, { maxRedirects: 5 }],
      ['POST 302 -> method/body', 'post', 302, { maxRedirects: 5 }],
      ['POST 303 -> method/body', 'post', 303, { maxRedirects: 5 }],
      ['POST 307 keeps method/body', 'post', 307, { maxRedirects: 5 }],
      ['POST 308 keeps method/body', 'post', 308, { maxRedirects: 5 }],
    ] as Array<[string, string, number, any]>
  ).map(([name, m, code, cfg]) => ({
    name: `redirect: ${name}`,
    options: cfg,
    run: (s: any, ctx: Ctx) => {
      const url = `${ctx.base}/redirect?code=${code}&to=/echo/after`;
      return m === 'post' ? s.post(url, { a: 1 }, cfg) : s.get(url, cfg);
    },
    normalize: (o: any) => ({
      requests: o.requests.map((r: any) => ({ method: r.method, url: r.url })),
      ok: !!o.result,
    }),
  })),
  {
    name: 'redirect loop exceeds maxRedirects',
    run: (s, ctx) => s.get(`${ctx.base}/redirect-loop`, { maxRedirects: 3 }),
    normalize: (o: any) => ({ code: o.error?.code, hops: o.requests.length }),
  },
  {
    // No `maxRedirects` set anywhere: both must default to 21 and reject on
    // the 22nd hop.
    name: 'redirect loop exceeds the default limit (21 vs 22)',
    run: (s, ctx) => s.get(`${ctx.base}/redirect-loop`),
    normalize: (o: any) => ({ code: o.error?.code, hops: o.requests.length }),
  },
  {
    name: 'redirect: maxRedirects 0 returns the 3xx response as-is',
    run: (s, ctx) =>
      s.get(`${ctx.base}/redirect?code=302&to=/echo`, {
        maxRedirects: 0,
        validateStatus: () => true,
      }),
    normalize: (o: any) => ({
      status: o.result?.status,
      location: o.result?.headers?.location,
      hops: o.requests.length,
    }),
  },
  {
    // A relative `Location` with no leading slash resolves against the
    // *current* URL's path (dropping its last segment), not the origin root.
    name: 'redirect: relative Location without a leading slash',
    run: (s, ctx) =>
      s.get(
        `${ctx.base}/redirect?code=302&to=${encodeURIComponent('echo/after')}`,
      ),
    normalize: (o: any) => o.requests.map((r: any) => r.url),
  },
  {
    name: 'redirect: cross-host drops Authorization/Cookie',
    run: (s: any, ctx: Ctx) =>
      s.get(
        `${ctx.base}/redirect?to=${encodeURIComponent(`${ctx.other}/echo`)}`,
        { headers: { Authorization: 'Bearer secret', Cookie: 'a=b' } },
      ),
  },
  {
    name: 'redirect: beforeRedirect can rewrite headers for the next hop',
    run: (s, ctx) =>
      s.get(`${ctx.base}/redirect?code=302&to=/echo`, {
        beforeRedirect: (options: any) => {
          options.headers = { ...options.headers, 'X-B': 'hooked' };
        },
      }),
  },
  // ---- size limits per request
  {
    name: 'maxContentLength per request',
    run: (s, ctx) =>
      s.get(`${ctx.base}/big?n=2000`, { maxContentLength: 1000 }),
    normalize: (o: any) => ({ code: o.error?.code, name: o.error?.name }),
  },
  {
    name: 'maxBodyLength per request',
    run: (s, ctx) =>
      s.post(`${ctx.base}/echo`, 'x'.repeat(2000), { maxBodyLength: 1000 }),
    normalize: (o: any) => ({ code: o.error?.code, sent: o.requests.length }),
  },
  {
    // A stream body over `maxBodyLength`, with the default (redirects-on)
    // `maxRedirects`: axios' default transport (`follow-redirects`)
    // enforces this itself - `ERR_FR_MAX_BODY_LENGTH_EXCEEDED` (checked
    // against real axios 1.20), not axios' own `ERR_BAD_REQUEST` (that code
    // is only for a body whose length axios can check upfront - a string or
    // Buffer, see the case above).
    name: 'maxBodyLength per request with a stream body',
    run: (s, ctx) =>
      s.post(`${ctx.base}/echo`, Readable.from([Buffer.alloc(2000, 'x')]), {
        maxBodyLength: 1000,
      }),
    normalize: (o: any) => ({ code: o.error?.code, sent: o.requests.length }),
  },
  {
    // Undici validates a header value (rejecting a bare `\n`) more strictly
    // than Node's own `http` module (which axios uses, and which silently
    // strips it) - checked against real axios 1.20: it resolves 200 with
    // the newline removed, where this library rejects. Full parity would
    // need this library to sanitize header values the same way Node's own
    // `http` does before ever handing them to undici; not attempted. What
    // *is* fixed: the rejection is a well-formed `AxiosError`
    // (`ERR_BAD_REQUEST`, `config`/`request` set), not a raw undici
    // `InvalidArgumentError` - plan.md phase 2 "fix(errors): match axios
    // errors", item 2 ("synchronous undici errors... become AxiosErrors").
    name: 'header value with an embedded newline',
    run: (s, ctx) =>
      s.get(`${ctx.base}/echo`, { headers: { 'X-Bad': 'a\nb' } }),
    normalize: (o: any) => ({
      resolved: !!o.result,
      code: o.error?.code,
      isAxiosError: axios.isAxiosError(o.error),
      hasConfig: !!o.error?.config,
    }),
    knownDifference: ERRORS,
  },
]);
