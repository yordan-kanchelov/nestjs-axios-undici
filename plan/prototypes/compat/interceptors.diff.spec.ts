import { firstValueFrom, lastValueFrom, timeout as rxTimeout, race, timer, switchMap, of, retry } from 'rxjs';
import { base, closeModules, pair, recorded, sleep, startServer, stopServer } from './harness';

describe('diff: axiosRef interceptors, defaults and instance API', () => {
  beforeAll(startServer);
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  /** Runs `setup` on a fresh pair, then one GET, returns what each side observed. */
  async function run(setup: (ref: any, log: string[]) => void, call?: (s: any) => any) {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const log: string[] = [];
      setup((s as any).axiosRef, log);
      let res: any;
      try {
        res = await firstValueFrom(call ? call(s) : (s as any).get(`${base}/echo`, { params: { q: 1 }, headers: { 'X-Req': 'r' } }));
        res = { status: res.status, data: res.data };
      } catch (e: any) {
        res = { error: e.message, code: e.code };
      }
      out[k] = { log, res };
    }
    return out;
  }

  it('request/response interceptor order', async () => {
    const r = await run((ref, log) => {
      ref.interceptors.request.use((c: any) => (log.push('req1'), c));
      ref.interceptors.request.use((c: any) => (log.push('req2'), c));
      ref.interceptors.response.use((x: any) => (log.push('res1'), x));
      ref.interceptors.response.use((x: any) => (log.push('res2'), x));
    });
    expect(r.undici.log).toEqual(r.axios.log);
  });

  it('request interceptor config contents', async () => {
    const r = await run((ref, log) => {
      ref.interceptors.request.use((c: any) => {
        log.push(
          JSON.stringify({
            url: c.url,
            baseURL: c.baseURL,
            method: c.method,
            params: c.params,
            data: c.data,
            timeout: c.timeout,
            xreq: c.headers?.['X-Req'] ?? c.headers?.get?.('X-Req'),
            headersIsAxiosHeaders: typeof c.headers?.set === 'function' && typeof c.headers?.setContentType === 'function',
            hasTransform: Array.isArray(c.transformRequest),
            hasAdapter: c.adapter !== undefined,
          }),
        );
        return c;
      });
    }, s => s.post('/echo', { a: 1 }, { baseURL: base, params: { q: 1 }, headers: { 'X-Req': 'r' }, timeout: 1000 }));
    expect(JSON.parse(r.undici.log[0])).toEqual(JSON.parse(r.axios.log[0]));
  });

  it('request interceptor mutating config.data object', async () => {
    const r = await run(
      ref => ref.interceptors.request.use((c: any) => ((c.data.added = true), c)),
      s => s.post(`${base}/echo`, { a: 1 }),
    );
    expect(r.undici.res).toEqual(r.axios.res);
  });

  it('request interceptor adding params', async () => {
    const r = await run(
      ref => ref.interceptors.request.use((c: any) => ((c.params = { ...c.params, key: 'k' }), c)),
      s => s.get(`${base}/echo`, { params: { q: 1 } }),
    );
    expect(r.undici.res.data.url).toEqual(r.axios.res.data.url);
  });

  it('request interceptor setting header via headers.set / Authorization', async () => {
    const r = await run(ref =>
      ref.interceptors.request.use((c: any) => {
        c.headers.set('X-Set', '1');
        c.headers.Authorization = 'Bearer t';
        return c;
      }),
    );
    expect([r.undici.res.data.headers['x-set'], r.undici.res.data.headers.authorization]).toEqual([
      r.axios.res.data.headers['x-set'],
      r.axios.res.data.headers.authorization,
    ]);
  });

  it('request interceptor changing baseURL/url', async () => {
    const r = await run(
      ref => ref.interceptors.request.use((c: any) => ((c.url = '/echo/rewritten'), c)),
      s => s.get('/echo/orig', { baseURL: base }),
    );
    expect(r.undici.res.data?.url).toEqual(r.axios.res.data?.url);
  });

  it('request interceptor throwing rejects the request (no network call)', async () => {
    const before = recorded.length;
    const r = await run(ref => ref.interceptors.request.use(() => { throw new Error('nope'); }));
    expect(r.undici.res).toEqual(r.axios.res);
    expect(recorded.length - before).toBe(0);
  });

  it('response interceptor onRejected recovers', async () => {
    const r = await run(
      ref => ref.interceptors.response.use(undefined, (e: any) => ({ status: 299, data: 'recovered:' + e.response.status })),
      s => s.get(`${base}/raw?status=404`),
    );
    expect(r.undici.res).toEqual(r.axios.res);
  });

  it('response interceptor retry pattern: axiosRef.request(error.config)', async () => {
    const r = await run(
      ref =>
        ref.interceptors.response.use(undefined, (e: any) => {
          if (e.config.__retried) throw e;
          e.config.__retried = true;
          e.config.url = e.config.url.replace('/raw?status=401', '/echo/retried');
          return ref.request(e.config);
        }),
      s => s.get(`${base}/raw?status=401`),
    );
    expect(r.undici.res.data?.url).toEqual(r.axios.res.data?.url);
  });

  it('interceptor options: runWhen / synchronous', async () => {
    const r = await run((ref, log) => {
      ref.interceptors.request.use((c: any) => (log.push('skipped?'), c), null, { runWhen: () => false });
      ref.interceptors.request.use((c: any) => (log.push('sync'), c), null, { synchronous: true });
    });
    expect(r.undici.log).toEqual(r.axios.log);
  });

  it('interceptor registered in one service does not leak between modules', async () => {
    const p1 = await pair();
    const p2 = await pair();
    p1.u.axiosRef.interceptors.request.use((c: any) => (c.headers['X-Leak'] = '1', c));
    const res: any = await firstValueFrom(p2.u.get(`${base}/echo`));
    expect(res.data.headers['x-leak']).toBeUndefined();
  });

  it('interceptors.request.handlers / forEach exist', async () => {
    const p = await pair();
    const shape = (ref: any) => ({
      handlers: Array.isArray(ref.interceptors.request.handlers),
      forEach: typeof ref.interceptors.request.forEach,
    });
    expect(shape(p.u.axiosRef)).toEqual(shape(p.a.axiosRef));
  });

  it('axiosRef instance API surface', async () => {
    const p = await pair();
    const keys = ['request', 'get', 'delete', 'head', 'options', 'post', 'put', 'patch', 'postForm', 'putForm', 'patchForm', 'getUri', 'create', 'query'];
    const shape = (ref: any) => Object.fromEntries(keys.map(k => [k, typeof ref[k]]).concat([['callable', typeof ref]]));
    expect(shape(p.u.axiosRef)).toEqual(shape(p.a.axiosRef));
  });

  it('HttpService method surface', async () => {
    const p = await pair();
    const keys = ['request', 'get', 'delete', 'head', 'post', 'put', 'patch', 'postForm', 'putForm', 'patchForm', 'query', 'axiosRef'];
    const shape = (s: any) => Object.fromEntries(keys.map(k => [k, typeof s[k]]));
    const a = shape(p.a);
    a.query = 'function'; // present in @nestjs/axios >= 12 (axios >= 1.13 QUERY method)
    expect(shape(p.u)).toEqual(a);
  });

  it('axiosRef.defaults runtime mutations', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const d: any = (s as any).axiosRef.defaults;
      d.baseURL = base;
      d.timeout = 5000;
      d.headers.common['X-Common'] = 'c';
      d.headers.post['X-Post'] = 'p';
      d.params = { dp: 1 };
      d.validateStatus = () => true;
      d.maxRedirects = 0;
      d.responseType = 'text';
      const res: any = await firstValueFrom((s as any).post('/raw?status=404&ct=application/json&body={}', { a: 1 }));
      out[k] = { status: res.status, dataType: typeof res.data };
      const echo: any = await firstValueFrom((s as any).post('/echo', { a: 1 }, { responseType: 'json' }));
      out[k].url = echo.data.url;
      out[k].hc = echo.data.headers['x-common'];
      out[k].hp = echo.data.headers['x-post'];
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('axiosRef.defaults shape', async () => {
    const p = await pair({ baseURL: 'http://x', timeout: 10, headers: { 'X-A': 'a' } });
    const shape = (d: any) => ({
      baseURL: d.baseURL,
      timeout: d.timeout,
      xa: d.headers?.['X-A'] ?? d.headers?.common?.['X-A'],
      acceptCommon: d.headers?.common?.Accept,
      transformRequest: Array.isArray(d.transformRequest),
      transformResponse: Array.isArray(d.transformResponse),
      validateStatus: typeof d.validateStatus,
      maxRedirects: d.maxRedirects,
    });
    expect(shape(p.u.axiosRef.defaults)).toEqual(shape(p.a.axiosRef.defaults));
  });
});

describe('diff: Observable semantics', () => {
  beforeAll(startServer);
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  it('cold: no request until subscribe; each subscription = one request', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const before = recorded.length;
      const o = (s as any).get(`${base}/echo`);
      await sleep(50);
      const afterCreate = recorded.length - before;
      await firstValueFrom(o);
      await firstValueFrom(o);
      out[k] = { afterCreate, total: recorded.length - before };
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('unsubscribe aborts the in-flight request (rxjs timeout / switchMap / race)', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const before = recorded.length;
      await lastValueFrom((s as any).get(`${base}/slow?ms=1500`).pipe(rxTimeout(100))).catch(() => 0);
      await lastValueFrom(race((s as any).get(`${base}/slow?ms=1500`), timer(100))).catch(() => 0);
      await lastValueFrom(of(1).pipe(switchMap(() => (s as any).get(`${base}/slow?ms=1500`)), rxTimeout(100))).catch(() => 0);
      await sleep(150);
      out[k] = recorded.slice(before).map(r => r.aborted);
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('interceptor side effects happen per subscription', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      let n = 0;
      (s as any).axiosRef.interceptors.request.use((c: any) => (n++, c));
      const o = (s as any).get(`${base}/echo`);
      await firstValueFrom(o);
      await firstValueFrom(o);
      out[k] = n;
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('rxjs retry() re-runs axiosRef request interceptors per attempt (fresh token/signature)', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      let n = 0;
      (s as any).axiosRef.interceptors.request.use((c: any) => ((c.headers['X-N'] = String(++n)), c));
      const before = recorded.length;
      await firstValueFrom((s as any).get(`${base}/raw?status=500`).pipe(retry(2))).catch(() => 0);
      out[k] = recorded.slice(before).map(r => r.headers['x-n']);
    }
    expect(out.undici).toEqual(out.axios); // axios: ['1','2','3']
  });
});
