import { firstValueFrom } from 'rxjs';
import { base, both, closeModules, pair, Pair, startServer, stopServer } from './harness';

const raw = (qs: Record<string, string>) => `${base}/raw?${new URLSearchParams(qs)}`;
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

describe('diff: response shape', () => {
  let p: Pair;
  beforeAll(async () => {
    await startServer();
    p = await pair();
  });
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  const cases: Array<[string, Record<string, string>, any?]> = [
    ['json', { ct: 'application/json', body: '{"a":1}' }],
    ['json charset', { ct: 'application/json; charset=utf-8', body: '{"a":1}' }],
    ['problem+json', { ct: 'application/problem+json', body: '{"title":"x"}' }],
    ['vnd.api+json', { ct: 'application/vnd.api+json', body: '{"data":[]}' }],
    ['hal+json', { ct: 'application/hal+json', body: '{"_links":{}}' }],
    ['text/plain json-looking', { ct: 'text/plain', body: '{"a":1}' }],
    ['text/html', { ct: 'text/html', body: '<p>hi</p>' }],
    ['no content-type text', { body: 'hello' }],
    ['no content-type json-looking', { body: '{"a":1}' }],
    ['octet-stream', { ct: 'application/octet-stream', body: 'bin' }],
    ['application/javascript', { ct: 'application/javascript', body: 'var a=1' }],
    ['x-www-form-urlencoded', { ct: 'application/x-www-form-urlencoded', body: 'a=1&b=2' }],
    ['image/svg+xml', { ct: 'image/svg+xml', body: '<svg/>' }],
    ['application/xml', { ct: 'application/xml', body: '<a/>' }],
    ['text/csv', { ct: 'text/csv', body: 'a,b\n1,2' }],
    ['invalid json', { ct: 'application/json', body: 'not json{' }],
    ['json number', { ct: 'application/json', body: '42' }],
    ['json string literal', { ct: 'application/json', body: '"str"' }],
    ['json null', { ct: 'application/json', body: 'null' }],
    ['empty json', { ct: 'application/json', body: '' }],
    ['empty octet', { ct: 'application/octet-stream', body: '' }],
    ['empty no ct', {}],
    ['BOM json', { ct: 'application/json', b64: b64(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}')])) }],
    ['latin1 charset', { ct: 'text/plain; charset=iso-8859-1', b64: b64(Buffer.from([0x63, 0x61, 0x66, 0xe9])) }],
    ['utf8 multibyte', { ct: 'text/plain; charset=utf-8', body: 'żółw 🐢' }],
    ['204', { status: '204', ct: 'application/json' }],
    ['204 no ct', { status: '204' }],
    ['304', { status: '304' }, { validateStatus: () => true }],
    ['201 json', { status: '201', ct: 'application/json', body: '{"id":1}' }],
    ['custom reason phrase', { status: '200', reason: 'Everything Fine', ct: 'text/plain', body: 'x' }],
    ['unknown status 299', { status: '299', ct: 'text/plain', body: 'x' }],
    ['404 json body', { status: '404', ct: 'application/json', body: '{"err":1}' }],
    ['500 text body', { status: '500', ct: 'text/plain', body: 'boom' }],
    ['302 without follow', { status: '302', ct: 'text/plain', body: 'moved' }, { maxRedirects: 0 }],
  ];

  it.each(cases)('GET %s', async (...[, qs, cfg]: any[]) => {
    const r = await both(p, s => s.get(raw(qs), cfg));
    expect(r.undici.out).toEqual(r.axios.out);
  });

  const types = ['json', 'text', 'arraybuffer', 'blob', 'stream', 'document'] as const;
  const bodies: Array<[string, Record<string, string>]> = [
    ['json body', { ct: 'application/json', body: '{"a":1}' }],
    ['text body', { ct: 'text/plain', body: '{"a":1}' }],
    ['octet body', { ct: 'application/octet-stream', body: 'abc' }],
    ['invalid json', { ct: 'application/json', body: 'nope' }],
  ];
  for (const t of types)
    it.each(bodies)(`responseType ${t}: %s`, async (_n, qs) => {
      const r = await both(p, s => s.get(raw(qs), { responseType: t }));
      expect(r.undici.out).toEqual(r.axios.out);
    });

  it('responseType arraybuffer: data is Buffer in both', async () => {
    const a = await firstValueFrom(p.a.get(raw({ body: 'x' }), { responseType: 'arraybuffer' }));
    const u = await firstValueFrom(p.u.get(raw({ body: 'x' }), { responseType: 'arraybuffer' }));
    expect([Buffer.isBuffer(u.data), u.data.constructor.name]).toEqual([
      Buffer.isBuffer(a.data),
      a.data.constructor.name,
    ]);
  });

  it('responseType blob: data type', async () => {
    const a = await firstValueFrom(p.a.get(raw({ body: 'x' }), { responseType: 'blob' }));
    const u = await firstValueFrom(p.u.get(raw({ body: 'x' }), { responseType: 'blob' }));
    expect(u.data.constructor.name).toBe(a.data.constructor.name);
  });

  it('responseType stream with 404: error.response.data is a stream in both', async () => {
    const get = async (s: any) => {
      try {
        await firstValueFrom(s.get(raw({ status: '404', body: 'nf' }), { responseType: 'stream' }));
      } catch (e: any) {
        return typeof e.response?.data?.pipe;
      }
    };
    expect(await get(p.u)).toBe(await get(p.a));
  });

  it('HEAD', async () => {
    const r = await both(p, s => s.head(raw({ ct: 'application/json', body: '{"a":1}' })));
    expect(r.undici.out).toEqual(r.axios.out);
  });

  it('headers: casing, multi-value set-cookie, duplicates', async () => {
    const r = await both(p, s => s.get(`${base}/multi-headers`), { headers: true });
    delete r.axios.out.headers['content-length'];
    delete r.undici.out.headers['content-length'];
    expect(r.undici.out.headers).toEqual(r.axios.out.headers);
  });

  it('response.headers AxiosHeaders API (get/has/getContentType)', async () => {
    const probe = async (s: any) => {
      const res: any = await firstValueFrom(s.get(`${base}/multi-headers`));
      return {
        get: typeof res.headers.get,
        has: typeof res.headers.has,
        getContentType: typeof res.headers.getContentType,
        toJSON: typeof res.headers.toJSON,
      };
    };
    expect(await probe(p.u)).toEqual(await probe(p.a));
  });

  it('response.config shape', async () => {
    const probe = async (s: any) => {
      const res: any = await firstValueFrom(
        s.get('/raw', { baseURL: base, params: { q: 1 }, headers: { 'X-A': '1' } }),
      );
      const c = res.config;
      return {
        url: c.url,
        baseURL: c.baseURL,
        params: c.params,
        method: c.method,
        headersGet: typeof c.headers?.get,
        xa: c.headers?.['X-A'],
        hasRequest: !!res.request,
      };
    };
    expect(await probe(p.u)).toEqual(await probe(p.a));
  });
});
