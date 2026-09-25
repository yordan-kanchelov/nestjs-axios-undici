/**
 * Differential: errors, timeouts, cancellation, redirects, size limits.
 * See harness.ts.
 */
import axios from 'axios';
import { differential, Ctx } from './harness';

const REDIRECTS = 'plan.md phase 2: fix: follow redirects by default (21)';
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
    name: '404 error shape',
    run: (s, ctx) =>
      s.get(`${ctx.base}/raw?status=404&ct=application/json&body={"e":1}`),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: '500 error shape',
    run: (s, ctx) =>
      s.get(`${ctx.base}/raw?status=500&ct=text/plain&body=boom`),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'ECONNREFUSED',
    run: s => s.get('http://127.0.0.1:1/x'),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'ENOTFOUND',
    run: s => s.get('http://does-not-exist.invalid/x'),
    normalize: errShape,
    knownDifference: ERRORS,
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
    knownDifference: ERRORS,
  },
  {
    name: 'AbortSignal already aborted',
    run: (s, ctx) => s.get(`${ctx.base}/echo`, { signal: AbortSignal.abort() }),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'AbortSignal aborted mid-flight',
    run: (s, ctx) => {
      const c = new AbortController();
      setTimeout(() => c.abort(), 100);
      return s.get(`${ctx.base}/slow?ms=2000`, { signal: c.signal });
    },
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'AbortSignal.timeout()',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=2000`, { signal: AbortSignal.timeout(100) }),
    normalize: errShape,
    knownDifference: ERRORS,
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
    knownDifference: ERRORS,
  },
  {
    name: 'timeout: headers never arrive (code/message)',
    run: (s, ctx) => s.get(`${ctx.base}/slow?ms=3000`, { timeout: 300 }),
    normalize: errShape,
    knownDifference: ERRORS,
  },
  {
    name: 'timeout covers a slowly trickling body (axios: total time)',
    run: (s, ctx) => s.get(`${ctx.base}/slow-body?ms=1500`, { timeout: 500 }),
    normalize: errShape,
    knownDifference:
      'plan.md phase 2: fix(observable): abort on unsubscribe and run request interceptors per subscription',
  },
  {
    name: 'transitional.clarifyTimeoutError => ETIMEDOUT',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=3000`, {
        timeout: 300,
        transitional: { clarifyTimeoutError: true },
      }),
    normalize: (o: any) => o.error?.code,
    knownDifference: ERRORS,
  },
  {
    name: 'timeoutErrorMessage',
    run: (s, ctx) =>
      s.get(`${ctx.base}/slow?ms=3000`, {
        timeout: 300,
        timeoutErrorMessage: 'custom!',
      }),
    normalize: (o: any) => o.error?.message,
    knownDifference: ERRORS,
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
    // this library defaults to zero redirects (documented); axios follows up to 21.
    knownDifference: name.startsWith('GET 302 default') ? REDIRECTS : undefined,
  })),
  {
    name: 'redirect loop exceeds maxRedirects',
    run: (s, ctx) => s.get(`${ctx.base}/redirect-loop`, { maxRedirects: 3 }),
    normalize: (o: any) => ({ code: o.error?.code, hops: o.requests.length }),
    knownDifference: ERRORS,
  },
  // ---- size limits per request
  {
    name: 'maxContentLength per request',
    run: (s, ctx) =>
      s.get(`${ctx.base}/big?n=2000`, { maxContentLength: 1000 }),
    normalize: (o: any) => ({ code: o.error?.code, name: o.error?.name }),
    knownDifference: ERRORS,
  },
  {
    name: 'maxBodyLength per request',
    run: (s, ctx) =>
      s.post(`${ctx.base}/echo`, 'x'.repeat(2000), { maxBodyLength: 1000 }),
    normalize: (o: any) => ({ code: o.error?.code, sent: o.requests.length }),
    knownDifference: ERRORS,
  },
]);
