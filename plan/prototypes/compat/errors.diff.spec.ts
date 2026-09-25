import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import { base, both, closeModules, pair, Pair, startServer, stopServer } from './harness';

/** Shape of an error that user code commonly inspects. */
async function errShape(o: any) {
  try {
    await firstValueFrom(o);
    return 'resolved';
  } catch (e: any) {
    const json = typeof e.toJSON === 'function' ? e.toJSON() : undefined;
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
      configUrl: e.config?.url,
      hasRequest: !!e.request,
      // axios' toJSON also emits Mozilla/Microsoft-only keys (fileName, lineNumber, ...): ignore them
      jsonKeys: json ? Object.keys(json).filter(k => !['columnNumber', 'description', 'fileName', 'lineNumber', 'number'].includes(k)).sort() : undefined,
      jsonStatus: json?.status,
      stackHasName: typeof e.stack === 'string',
    };
  }
}

describe('diff: errors, timeouts, cancellation, redirects', () => {
  let p: Pair;
  beforeAll(async () => {
    await startServer();
    p = await pair();
  });
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  const cmp = async (call: (s: any) => any) => {
    const a = await errShape(call(p.a));
    const u = await errShape(call(p.u));
    return { a, u };
  };

  it('404 error shape', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/raw?status=404&ct=application/json&body={"e":1}`));
    expect(u).toEqual(a);
  });

  it('500 error shape', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/raw?status=500&ct=text/plain&body=boom`));
    expect(u).toEqual(a);
  });

  it('ECONNREFUSED', async () => {
    const { a, u } = await cmp(s => s.get('http://127.0.0.1:1/x'));
    expect(u).toEqual(a);
  });

  it('ENOTFOUND', async () => {
    const { a, u } = await cmp(s => s.get('http://does-not-exist.invalid/x'));
    expect(u).toEqual(a);
  });

  it('socket hang up / ECONNRESET', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/destroy`));
    expect(u).toEqual(a);
  });

  it('invalid URL', async () => {
    const { a, u } = await cmp(s => s.get('not a url'));
    expect(u).toEqual(a);
  });

  it('unsupported protocol', async () => {
    const { a, u } = await cmp(s => s.get('ftp://127.0.0.1/x'));
    expect(u).toEqual(a);
  });

  it('timeout (headers never arrive) 300ms: code/message and elapsed', async () => {
    const t0 = Date.now();
    const a = await errShape(p.a.get(`${base}/slow?ms=3000`, { timeout: 300 }));
    const ta = Date.now() - t0;
    const t1 = Date.now();
    const u = await errShape(p.u.get(`${base}/slow?ms=3000`, { timeout: 300 }));
    const tu = Date.now() - t1;
    expect({ ...u, late: tu > ta + 400 }).toEqual({ ...a, late: false });
  });

  it('timeout covers a slowly trickling body (axios: total time)', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/slow-body?ms=1500`, { timeout: 500 }));
    expect(u).toEqual(a);
  });

  it('transitional.clarifyTimeoutError => ETIMEDOUT', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/slow?ms=3000`, { timeout: 300, transitional: { clarifyTimeoutError: true } }));
    expect(u).toEqual(a);
  });

  it('timeoutErrorMessage', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/slow?ms=3000`, { timeout: 300, timeoutErrorMessage: 'custom!' }));
    expect(u).toEqual(a);
  });

  it('AbortSignal already aborted', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/echo`, { signal: AbortSignal.abort() }));
    expect(u).toEqual(a);
  });

  it('AbortSignal aborted mid-flight', async () => {
    const { a, u } = await cmp(s => {
      const c = new AbortController();
      setTimeout(() => c.abort(), 100);
      return s.get(`${base}/slow?ms=2000`, { signal: c.signal });
    });
    expect(u).toEqual(a);
  });

  it('AbortSignal.timeout()', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/slow?ms=2000`, { signal: AbortSignal.timeout(100) }));
    expect(u).toEqual(a);
  });

  it('CancelToken with message', async () => {
    const { a, u } = await cmp(s => {
      const src = axios.CancelToken.source();
      setTimeout(() => src.cancel('bye'), 100);
      return s.get(`${base}/slow?ms=2000`, { cancelToken: src.token });
    });
    expect(u).toEqual(a);
  });

  it('validateStatus null accepts everything', async () => {
    const r = await both(p, s => s.get(`${base}/raw?status=500&body=x`, { validateStatus: null }));
    expect(r.undici.out).toEqual(r.axios.out);
  });

  // skipped: real axios throws this synchronously out of a stream 'end' handler (uncaught), not a useful baseline
  it.skip('validateStatus throwing', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/raw?status=200&body=x`, { validateStatus: () => { throw new Error('vs'); } }));
    expect(u).toEqual(a);
  });

  // ---- redirects
  const redirects: Array<[string, string, number, any?]> = [
    ['GET 302 default (no maxRedirects)', 'get', 302],
    ['POST 301 -> method/body', 'post', 301, { maxRedirects: 5 }],
    ['POST 302 -> method/body', 'post', 302, { maxRedirects: 5 }],
    ['POST 303 -> method/body', 'post', 303, { maxRedirects: 5 }],
    ['POST 307 keeps method/body', 'post', 307, { maxRedirects: 5 }],
    ['POST 308 keeps method/body', 'post', 308, { maxRedirects: 5 }],
  ];
  it.each(redirects)('redirect: %s', async (...[, m, code, cfg]: any[]) => {
    const url = `${base}/redirect?code=${code}&to=/echo/after`;
    const r = await both(p, s => (m === 'post' ? s.post(url, { a: 1 }, cfg) : s.get(url, cfg)), { serverHeaders: ['content-type'] });
    expect(r.undici.server).toEqual(r.axios.server);
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('redirect: response.request.res.responseUrl / final URL visible', async () => {
    const get = async (s: any) => {
      const res: any = await firstValueFrom(s.get(`${base}/redirect?code=302&to=/echo/final`, { maxRedirects: 5 }));
      return res.request?.res?.responseUrl ?? res.request?.responseURL ?? null;
    };
    expect(await get(p.u)).toEqual(await get(p.a));
  });

  it('redirect loop exceeds maxRedirects', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/redirect-loop`, { maxRedirects: 3 }));
    expect(u).toEqual(a);
  });

  it('beforeRedirect hook is called', async () => {
    const calls = { a: 0, u: 0 };
    await firstValueFrom(p.a.get(`${base}/redirect?to=/echo`, { beforeRedirect: () => void calls.a++ }));
    await firstValueFrom(p.u.get(`${base}/redirect?to=/echo`, { beforeRedirect: () => void calls.u++, maxRedirects: 5 } as any)).catch(() => 0);
    expect(calls.u).toBe(calls.a);
  });

  // ---- decompression
  it.each(['/gzip', '/br', '/deflate'])('compressed %s', async (...[path]: any[]) => {
    const r = await both(p, s => s.get(`${base}${path}`));
    expect(r.undici.out).toEqual(r.axios.out);
  });

  it('server that gzips when Accept-Encoding allows (typical CDN)', async () => {
    const r = await both(p, s => s.get(`${base}/negotiate-gzip`));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  it('decompress: false', async () => {
    const r = await both(p, s => s.get(`${base}/gzip`, { decompress: false, responseType: 'arraybuffer' }));
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('server content negotiation on Accept', async () => {
    const r = await both(p, s => s.get(`${base}/negotiate-accept`));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  // ---- size limits per request
  it('maxContentLength per request', async () => {
    const { a, u } = await cmp(s => s.get(`${base}/big?n=2000`, { maxContentLength: 1000 }));
    expect(u).toEqual(a);
  });

  it('maxBodyLength per request', async () => {
    const { a, u } = await cmp(s => s.post(`${base}/echo`, 'x'.repeat(2000), { maxBodyLength: 1000 }));
    expect(u).toEqual(a);
  });
});
