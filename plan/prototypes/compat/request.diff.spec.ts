import NodeFormData from 'form-data';
import { Readable } from 'node:stream';
import { base, both, closeModules, pair, Pair, startServer, stopServer } from './harness';

const SERVER_HEADERS = ['content-type', 'content-length', 'transfer-encoding', 'authorization'];
const ALL_DEFAULT_HEADERS = ['accept', 'user-agent', 'accept-encoding', 'content-type', 'content-length'];

describe('diff: request serialization', () => {
  let p: Pair;
  beforeAll(async () => {
    await startServer();
    p = await pair();
  });
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  const bodies: Array<[string, () => any, any?]> = [
    ['object', () => ({ a: 1, b: [1, 2], d: new Date(0) })],
    ['array', () => [1, 2]],
    ['string', () => 'plain'],
    ['json string w/ json ct', () => '{"a":1}', { headers: { 'Content-Type': 'application/json' } }],
    ['object w/ urlencoded ct', () => ({ a: 1, n: { b: 2 }, arr: [1, 2] }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }],
    ['object w/ text/plain ct', () => ({ a: 1 }), { headers: { 'Content-Type': 'text/plain' } }],
    ['URLSearchParams', () => new URLSearchParams({ a: '1', b: 'x y' })],
    ['Buffer', () => Buffer.from('buf')],
    ['Uint8Array', () => new Uint8Array([104, 105])],
    ['ArrayBuffer', () => new Uint8Array([104, 105]).buffer],
    ['Readable stream', () => Readable.from([Buffer.from('st'), Buffer.from('ream')])],
    ['number 0', () => 0],
    ['number 5', () => 5],
    ['boolean true', () => true],
    ['null', () => null],
    ['undefined', () => undefined],
    ['empty string', () => ''],
    ['empty object', () => ({})],
    ['Blob', () => new Blob(['blob'], { type: 'text/x-blob' })],
  ];

  it.each(bodies)('POST body: %s', async (...[, make, cfg]: any[]) => {
    const r = await both(p, s => s.post(`${base}/echo`, make(), cfg), {
      serverHeaders: SERVER_HEADERS,
    });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('POST global FormData', async () => {
    const make = () => {
      const f = new FormData();
      f.append('a', '1');
      f.append('file', new Blob(['hi'], { type: 'text/plain' }), 'x.txt');
      return f;
    };
    const r = await both(p, s => s.post(`${base}/echo`, make()), { serverHeaders: ['content-type'] });
    const norm = (v: any) => ({
      ct: String(v.headers['content-type']).split(';')[0],
      hasFile: v.body.includes('filename="x.txt"'),
    });
    expect(norm(r.undici.server)).toEqual(norm(r.axios.server));
  });

  it('POST form-data package', async () => {
    const make = () => {
      const f = new NodeFormData();
      f.append('a', '1');
      return f;
    };
    const r = await both(p, s => s.post(`${base}/echo`, make()), { serverHeaders: ['content-type', 'content-length', 'transfer-encoding'] });
    const norm = (v: any) => ({ ct: String(v.headers['content-type']).split(';')[0], cl: !!v.headers['content-length'], te: v.headers['transfer-encoding'] });
    expect(norm(r.undici.server)).toEqual(norm(r.axios.server));
  });

  it('postForm with a plain object (axios: multipart)', async () => {
    const r = await both(p, s => s.postForm(`${base}/echo`, { a: '1', b: [1, 2] }), { serverHeaders: ['content-type'] });
    expect(String(r.undici.server.headers['content-type']).split(';')[0]).toBe(
      String(r.axios.server.headers['content-type']).split(';')[0],
    );
  });

  it('postForm with urlencoded header + object', async () => {
    const r = await both(p, s => s.postForm(`${base}/echo`, { a: '1', b: { c: 2 } }, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), { serverHeaders: ['content-type'] });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it.each(['get', 'delete', 'head', 'options'])('%s without body: default headers', async (...[m]: any[]) => {
    const pp = p as any;
    const call = (s: any) => (m === 'options' && !s.options ? s.request({ url: `${base}/echo`, method: 'OPTIONS' }) : s[m](`${base}/echo`));
    const r = await both(pp, call, { serverHeaders: ALL_DEFAULT_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it.each(['post', 'put', 'patch'])('%s without body: default headers', async (...[m]: any[]) => {
    const r = await both(p, s => s[m](`${base}/echo`), { serverHeaders: ALL_DEFAULT_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('delete with data', async () => {
    const r = await both(p, s => s.delete(`${base}/echo`, { data: { a: 1 } }), { serverHeaders: SERVER_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('get with data (axios sends a body)', async () => {
    const r = await both(p, s => s.request({ url: `${base}/echo`, method: 'get', data: { a: 1 } }), { serverHeaders: SERVER_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('headers: null/undefined/false/number values, array values', async () => {
    const r = await both(p, s => s.get(`${base}/echo`, { headers: { 'X-Null': null, 'X-Undef': undefined, 'X-False': false, 'X-Num': 5, 'X-Arr': ['a', 'b'], 'X-Empty': '' } }), {
      serverHeaders: ['x-null', 'x-undef', 'x-false', 'x-num', 'x-arr', 'x-empty'],
    });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('header casing sent on the wire', async () => {
    const r = await both(p, s => s.post(`${base}/echo`, { a: 1 }, { headers: { 'x-lower': '1', 'X-Upper': '2', 'content-type': 'application/json' } }));
    // compare raw header names the server saw
    const { recorded } = require('./harness');
    const last2 = recorded.slice(-2).map((x: any) => x.rawHeaders.filter((_: any, i: number) => i % 2 === 0).filter((n: string) => /^(x-|content-type)/i.test(n)));
    expect(last2[1]).toEqual(last2[0]);
    expect(r.undici.out.ok).toBe(true);
  });

  it('auth + Authorization header', async () => {
    const r = await both(p, s => s.get(`${base}/echo`, { auth: { username: 'u', password: 'p:ß' }, headers: { Authorization: 'Bearer x' } }), { serverHeaders: SERVER_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('credentials in URL', async () => {
    const r = await both(p, s => s.get(base.replace('http://', 'http://user:pa%20ss@') + '/echo'), { serverHeaders: SERVER_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
    expect(r.undici.out.ok).toEqual(r.axios.out.ok);
  });
});

describe('diff: params & URL building', () => {
  let p: Pair;
  beforeAll(async () => {
    await startServer();
    p = await pair();
  });
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  const params: Array<[string, any, any?]> = [
    ['array', { a: [1, 2] }],
    ['nested', { a: { b: { c: 1 } } }],
    ['array of objects', { a: [{ b: 1 }, { b: 2 }] }],
    ['date', { d: new Date(0) }],
    ['null/undefined', { n: null, u: undefined, z: 0, f: false, e: '' }],
    ['special chars', { q: 'a b&c=d/é:$,@[]*' }],
    ['URLSearchParams', new URLSearchParams({ a: '1 2', b: 'x' })],
    ['existing query + hash', { a: 1 }],
    ['indexes true', { a: [1, 2] }, { paramsSerializer: { indexes: true } }],
    ['indexes null', { a: [1, 2] }, { paramsSerializer: { indexes: null } }],
    ['serializer fn', { a: 1 }, { paramsSerializer: (x: any) => `custom=${x.a}` }],
    ['serializer encode', { a: 'x y' }, { paramsSerializer: { encode: (v: string) => v.toUpperCase() } }],
    ['dots', { a: { b: 1 } }, { paramsSerializer: { dots: true } }],
    ['key with brackets', { 'a[]': [1, 2] }],
    ['object with toJSON', { o: { toJSON: () => 'j' } }],
    ['bigint-ish / symbol-free', { big: 12345678901234567890 }],
    ['string params', 'raw=1'],
  ];

  it.each(params)('params: %s', async (...[name, prm, cfg]: any[]) => {
    const url = name === 'existing query + hash' ? `${base}/echo?x=1#frag` : `${base}/echo`;
    const r = await both(p, s => s.get(url, { params: prm, ...cfg }));
    expect(r.undici.server.url).toEqual(r.axios.server.url);
  });

  const joins: Array<[string, string, string]> = [
    ['base no slash + rel no slash', '/api', 'users'],
    ['base slash + rel slash', '/api/', '/users'],
    ['base with query', '/api?k=1', 'users'],
    ['empty url', '/api', ''],
    ['url with query', '/api', 'users?x=1'],
    ['url dot segments', '/api/v1', '../v2/users'],
    ['url with double slash path', '/api', '//evil/users'],
  ];
  it.each(joins)('baseURL join: %s', async (...[, b, u]: any[]) => {
    const r = await both(p, s => s.get(u, { baseURL: base + b }));
    expect(r.undici.server?.url).toEqual(r.axios.server?.url);
  });

  it('absolute URL ignores baseURL; allowAbsoluteUrls false', async () => {
    const r = await both(p, s => s.get(`${base}/echo/abs`, { baseURL: `${base}/api`, allowAbsoluteUrls: false }));
    expect(r.undici.server?.url).toEqual(r.axios.server?.url);
  });

  it('URL object as url', async () => {
    const r = await both(p, s => s.get(new URL(`${base}/echo/obj`), { params: { a: 1 } }));
    expect(r.undici.server?.url).toEqual(r.axios.server?.url);
  });

  it('method casing lower in request(config)', async () => {
    const r = await both(p, s => s.request({ url: `${base}/echo`, method: 'post', data: { a: 1 } }), { serverHeaders: SERVER_HEADERS });
    expect(r.undici.server).toEqual(r.axios.server);
  });

  it('request(config) without method defaults to GET; with baseURL only', async () => {
    const r = await both(p, s => s.request({ url: '/echo/x', baseURL: base }));
    expect(r.undici.server?.url).toEqual(r.axios.server?.url);
  });
});
