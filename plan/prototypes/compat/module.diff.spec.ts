import { Agent as HttpAgent } from 'node:http';
import { firstValueFrom } from 'rxjs';
import axios from 'axios';
import { base, both, closeModules, pair, recorded, sleep, startServer, stopServer } from './harness';

describe('diff: module-level (HttpModule.register) options', () => {
  beforeAll(startServer);
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  const echo = () => `${base}/echo`;

  it('headers with axios method keys (common/post) in register()', async () => {
    const p = await pair({ headers: { common: { 'X-C': 'c' }, post: { 'X-P': 'p' }, 'X-Flat': 'f' } });
    const r = await both(p, s => s.post(echo(), { a: 1 }), { serverHeaders: ['x-c', 'x-p', 'x-flat', 'common', 'post'] });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('timeout module-level', async () => {
    const p = await pair({ timeout: 300 });
    const r = await both(p, s => s.get(`${base}/slow?ms=3000`));
    expect(r.undici.out).toEqual(r.axios.out);
  });

  it('maxRedirects module-level (5)', async () => {
    const p = await pair({ maxRedirects: 5 });
    const r = await both(p, s => s.get(`${base}/redirect?to=/echo/x`));
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('validateStatus module-level + per-request override', async () => {
    const p = await pair({ validateStatus: () => true });
    const r1 = await both(p, s => s.get(`${base}/raw?status=500&ct=text/plain&body=x`));
    const r2 = await both(p, s => s.get(`${base}/raw?status=500&ct=text/plain&body=x`, { validateStatus: (st: number) => st < 400 }));
    expect([r1.undici.out.ok, r2.undici.out.ok]).toEqual([r1.axios.out.ok, r2.axios.out.ok]);
  });

  it('responseType module-level + per-request override', async () => {
    const p = await pair({ responseType: 'text' });
    const r1 = await both(p, s => s.get(`${base}/raw?ct=application/json&body={"a":1}`));
    const r2 = await both(p, s => s.get(`${base}/raw?ct=application/json&body={"a":1}`, { responseType: 'json' }));
    expect([r1.undici.out.data, r2.undici.out.data]).toEqual([r1.axios.out.data, r2.axios.out.data]);
  });

  it('maxContentLength module-level; per-request override wins', async () => {
    const p = await pair({ maxContentLength: 100 });
    const r = await both(p, s => s.get(`${base}/big?n=500`, { maxContentLength: 10000 }));
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('maxBodyLength module-level with a stream body', async () => {
    const { Readable } = require('node:stream');
    const p = await pair({ maxBodyLength: 100, maxRedirects: 5 });
    const r = await both(p, s => s.post(echo(), Readable.from([Buffer.alloc(500, 'x')])));
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('transformResponse (custom, replaces default parsing)', async () => {
    const p = await pair({ transformResponse: [(data: any) => ({ raw: data, type: typeof data })] });
    const r = await both(p, s => s.get(`${base}/raw?ct=application/json&body={"big":12345678901234567890}`));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  it('transformResponse receives headers and status', async () => {
    const p = await pair({ transformResponse: [(data: any, headers: any, status: number) => ({ ct: headers?.['content-type'] ?? headers?.get?.('content-type'), status })] });
    const r = await both(p, s => s.get(`${base}/raw?ct=application/json&body={}`));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  it('transformResponse chained after axios defaults', async () => {
    const p = await pair({ transformResponse: [...(axios.defaults.transformResponse as any[]), (d: any) => ({ wrapped: d })] });
    const r = await both(p, s => s.get(`${base}/raw?ct=application/json&body={"a":1}`));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  it('transformRequest (custom, receives raw data, must return string)', async () => {
    const p = await pair({ transformRequest: [(data: any, headers: any) => { headers['Content-Type'] = 'text/x-custom'; return `custom:${typeof data}:${JSON.stringify(data)}`; }] });
    const r = await both(p, s => s.post(echo(), { a: 1 }), { serverHeaders: ['content-type'] });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('transformRequest per request', async () => {
    const p = await pair();
    const r = await both(p, s => s.post(echo(), { a: 1 }, { transformRequest: [(d: any) => 'x=' + d.a] }), { serverHeaders: ['content-type'] });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('transformResponse per request', async () => {
    const p = await pair();
    const r = await both(p, s => s.get(`${base}/raw?ct=application/json&body={"a":1}`, { transformResponse: [(d: any) => 'raw:' + d] }));
    expect(r.undici.out.data).toEqual(r.axios.out.data);
  });

  it('httpAgent keepAlive:false still works (maps to pipelining 0)', async () => {
    const p = await pair({ httpAgent: new HttpAgent({ keepAlive: false }) });
    const r = await both(p, s => s.get(echo()));
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('httpAgent with maxSockets + withCredentials', async () => {
    const p = await pair({ httpAgent: new HttpAgent({ keepAlive: true, maxSockets: 2 }), withCredentials: true });
    const r = await both(p, s => s.get(echo()));
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });

  it('withCredentials: cookies are NOT persisted by axios in Node', async () => {
    const p = await pair({ withCredentials: true });
    const r = await both(p, async s => {
      await firstValueFrom(s.get(`${base}/set-cookie`));
      return firstValueFrom(s.get(echo()));
    });
    expect(r.undici.out.data.headers.cookie).toEqual(r.axios.out.data.headers.cookie);
  });

  it('params module-level merged with request params', async () => {
    const p = await pair({ params: { k: 1 } });
    const r = await both(p, s => s.get(echo(), { params: { q: 2 } }));
    expect(r.undici.server.url).toEqual(r.axios.server.url);
  });

  it('socketPath', async () => {
    const p = await pair({ socketPath: '/tmp/does-not-exist.sock' });
    const r = await both(p, s => s.get('http://localhost/echo'));
    expect({ code: r.undici.out.code, ok: r.undici.out.ok }).toEqual({ code: r.axios.out.code, ok: r.axios.out.ok });
  });

  it('proxy: false disables env proxy; HTTP_PROXY env honoured by axios', async () => {
    const seen: string[] = [];
    const { createServer } = require('node:http');
    const proxy = createServer((req: any, res: any) => {
      seen.push(req.url);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('via-proxy');
    });
    await new Promise<void>(r => proxy.listen(0, '127.0.0.1', r));
    const port = proxy.address().port;
    process.env.HTTP_PROXY = `http://127.0.0.1:${port}`;
    process.env.NO_PROXY = '';
    try {
      const p = await pair();
      const r = await both(p, s => s.get('http://example.invalid/some/path'));
      expect(r.undici.out.data).toEqual(r.axios.out.data);
    } finally {
      delete process.env.HTTP_PROXY;
      delete process.env.NO_PROXY;
      proxy.close();
    }
  });

  it('registerAsync with axios options behaves like register', async () => {
    const { Test } = require('@nestjs/testing');
    const A = require('@nestjs/axios');
    const U = require('../../src');
    const opts = { baseURL: base, headers: { 'X-Async': '1' }, timeout: 2000, maxRedirects: 5, params: { k: 1 } };
    const ma = await Test.createTestingModule({ imports: [A.HttpModule.registerAsync({ useFactory: async () => opts })] }).compile();
    const mu = await Test.createTestingModule({ imports: [U.HttpModule.registerAsync({ useFactory: async () => opts })] }).compile();
    const r = await both({ a: ma.get(A.HttpService), u: mu.get(U.HttpService) }, s => s.get('/redirect?to=/echo/async'), { serverHeaders: ['x-async'] });
    expect(r.undici.server).toEqual(r.axios.server);
    await ma.close();
    await mu.close();
  });
});
