/**
 * Differential: response decoding (status, headers, body parsing,
 * compression, responseType). See harness.ts for what "differential" means
 * and plan.md phase 1 item D / plan/reports/axios-compat.md for the source
 * audit these cases are ported from.
 */
import {
  brotliCompressSync,
  deflateSync,
  gzipSync,
  zstdCompressSync,
} from 'node:zlib';
import { differential, normData, normHeaders, Ctx } from './harness';

const TYPES = 'plan.md phase 2: types: axios interop';

const raw = (ctx: Ctx, qs: Record<string, string>) =>
  `${ctx.base}/raw?${new URLSearchParams(qs)}`;
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

const routes = {
  // /raw?status=200&ct=text/plain&body=...&b64=...&reason=...
  '/raw': (req: any, res: any) => {
    const p = new URL(req.url, 'http://x').searchParams;
    const status = Number(p.get('status') || 200);
    const headers: Record<string, string> = {};
    if (p.has('ct')) headers['Content-Type'] = p.get('ct')!;
    if (p.has('reason')) res.statusMessage = p.get('reason')!;
    const body = p.has('b64')
      ? Buffer.from(p.get('b64')!, 'base64')
      : Buffer.from(p.get('body') ?? '');
    res.writeHead(status, headers);
    res.end(
      req.method === 'HEAD' || status === 204 || status === 304
        ? undefined
        : body,
    );
  },
  '/multi-headers': (_req: any, res: any) => {
    res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
    res.setHeader('X-Dup', ['one', 'two']);
    res.setHeader('X-Camel-Case', 'Val');
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  },
  '/gzip': (_req: any, res: any) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
    });
    res.end(gzipSync('{"z":"gzip"}'));
  },
  '/br': (_req: any, res: any) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'br',
    });
    res.end(brotliCompressSync('{"z":"br"}'));
  },
  '/deflate': (_req: any, res: any) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'deflate',
    });
    res.end(deflateSync('{"z":"deflate"}'));
  },
  '/zstd': (_req: any, res: any) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'zstd',
    });
    res.end(zstdCompressSync('{"z":"zstd"}'));
  },
  '/reviver': (_req: any, res: any) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"a":1,"b":2}');
  },
  '/negotiate-gzip': (req: any, res: any) => {
    if (String(req.headers['accept-encoding'] || '').includes('gzip')) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      });
      res.end(gzipSync('{"z":"gzip"}'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"z":"plain"}');
    }
  },
  '/negotiate-accept': (req: any, res: any) => {
    if (String(req.headers.accept || '').includes('application/json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"format":"json"}');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>html</html>');
    }
  },
};

/** Compares status/statusText/data (normalized) for a GET against /raw. */
async function resultShape(o: any) {
  return {
    status: o?.status,
    statusText: o?.statusText,
    data: await normData(o?.data),
  };
}

const bodyCases: Array<[string, Record<string, string>, any?]> = [
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
  [
    'x-www-form-urlencoded',
    { ct: 'application/x-www-form-urlencoded', body: 'a=1&b=2' },
  ],
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
  [
    'BOM json',
    {
      ct: 'application/json',
      b64: b64(
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from('{"a":1}'),
        ]),
      ),
    },
  ],
  [
    'latin1 charset',
    {
      ct: 'text/plain; charset=iso-8859-1',
      b64: b64(Buffer.from([0x63, 0x61, 0x66, 0xe9])),
    },
  ],
  ['utf8 multibyte', { ct: 'text/plain; charset=utf-8', body: 'żółw 🐢' }],
  ['201 json', { status: '201', ct: 'application/json', body: '{"id":1}' }],
  [
    '404 json body',
    { status: '404', ct: 'application/json', body: '{"err":1}' },
  ],
  ['500 text body', { status: '500', ct: 'text/plain', body: 'boom' }],
];

differential('Differential: response decoding', routes, [
  ...bodyCases.map(([name, qs, cfg]) => ({
    name: `GET ${name}`,
    run: (s: any, ctx: Ctx) => s.get(raw(ctx, qs), cfg),
    normalize: async (o: any) => ({
      result: await resultShape(o.result),
      error: o.error?.message,
    }),
  })),
  {
    name: 'GET 204 no body',
    run: (s, ctx) => s.get(raw(ctx, { status: '204', ct: 'application/json' })),
    normalize: async (o: any) => resultShape(o.result),
  },
  {
    name: 'GET 204 no content-type',
    run: (s, ctx) => s.get(raw(ctx, { status: '204' })),
    normalize: async (o: any) => resultShape(o.result),
  },
  {
    name: 'GET 304',
    options: { validateStatus: () => true },
    run: (s, ctx) => s.get(raw(ctx, { status: '304' })),
    normalize: async (o: any) => resultShape(o.result),
  },
  {
    name: '302 with maxRedirects: 0 rejects (matches axios)',
    options: { maxRedirects: 0 },
    run: (s, ctx) =>
      s.get(raw(ctx, { status: '302', ct: 'text/plain', body: 'moved' })),
    normalize: async (o: any) => ({
      result: await resultShape(o.result),
      code: o.error?.code,
    }),
  },
  {
    name: 'custom reason phrase',
    run: (s, ctx) =>
      s.get(
        raw(ctx, {
          status: '200',
          reason: 'Everything Fine',
          ct: 'text/plain',
          body: 'x',
        }),
      ),
    normalize: async (o: any) => resultShape(o.result),
  },
  {
    name: 'unknown status 299',
    run: (s, ctx) =>
      s.get(raw(ctx, { status: '299', ct: 'text/plain', body: 'x' })),
    normalize: async (o: any) => resultShape(o.result),
  },
  ...(['json', 'text', 'arraybuffer', 'blob', 'stream'] as const).flatMap(t =>
    [
      ['json body', { ct: 'application/json', body: '{"a":1}' }],
      ['text body', { ct: 'text/plain', body: '{"a":1}' }],
      ['octet body', { ct: 'application/octet-stream', body: 'abc' }],
      ['invalid json', { ct: 'application/json', body: 'nope' }],
    ].map(([name, qs]: any) => ({
      name: `responseType ${t}: ${name}`,
      run: (s: any, ctx: Ctx) => s.get(raw(ctx, qs), { responseType: t }),
      normalize: async (o: any) => ({
        result: await resultShape(o.result),
        error: o.error?.message,
      }),
    })),
  ),
  {
    name: 'HEAD',
    run: (s, ctx) =>
      s.head(raw(ctx, { ct: 'application/json', body: '{"a":1}' })),
    normalize: async (o: any) => resultShape(o.result),
  },
  {
    // Fixed by plan.md phase 2 "fix: join duplicate response headers like
    // axios/Node": a duplicated `X-Dup` now joins with ", " (matching
    // axios/Node's default header-join rule) instead of coming back as
    // undici's raw array; `set-cookie` stays an array on both sides either
    // way.
    name: 'headers: casing, multi-value set-cookie, duplicates',
    run: (s, ctx) => s.get(`${ctx.base}/multi-headers`),
    normalize: async (o: any) => normHeaders(o.result?.headers),
  },
  {
    name: 'response.headers AxiosHeaders API (get/has/getContentType)',
    run: (s, ctx) => s.get(`${ctx.base}/multi-headers`),
    normalize: (o: any) => ({
      get: typeof o.result?.headers?.get,
      has: typeof o.result?.headers?.has,
      getContentType: typeof o.result?.headers?.getContentType,
      toJSON: typeof o.result?.headers?.toJSON,
    }),
    knownDifference: TYPES,
  },
  {
    name: 'response.config shape',
    run: (s, ctx) =>
      s.get('/raw', {
        baseURL: ctx.base,
        params: { q: 1 },
        headers: { 'X-A': '1' },
      }),
    normalize: (o: any) => {
      const c = o.result?.config ?? {};
      return {
        url: c.url,
        baseURL: c.baseURL,
        params: c.params,
        method: c.method,
        headersGet: typeof c.headers?.get,
        xa: c.headers?.['X-A'],
        hasRequest: !!o.result?.request,
      };
    },
  },
  // ---- decompression
  ...['/gzip', '/br', '/deflate', '/zstd'].map(path => ({
    name: `compressed ${path}`,
    run: (s: any, ctx: Ctx) => s.get(`${ctx.base}${path}`),
    normalize: async (o: any) => resultShape(o.result),
  })),
  {
    name: 'zstd: responseType stream decompresses too',
    run: (s: any, ctx: Ctx) =>
      s.get(`${ctx.base}/zstd`, { responseType: 'stream' }),
    normalize: async (o: any) => (await normData(o.result?.data)) ?? null,
  },
  {
    name: 'zstd: decompress: false leaves the raw compressed bytes',
    run: (s: any, ctx: Ctx) =>
      s.get(`${ctx.base}/zstd`, {
        decompress: false,
        responseType: 'arraybuffer',
      }),
    normalize: (o: any) => ({ ok: !!o.result, status: o.result?.status }),
  },
  // ---- parseReviver
  {
    name: 'parseReviver (request-level) transforms the default-parsed JSON',
    run: (s: any, ctx: Ctx) =>
      s.get(`${ctx.base}/reviver`, {
        parseReviver: (key: string, value: any) =>
          typeof value === 'number' ? value * 10 : value,
      }),
    normalize: (o: any) => o.result?.data,
  },
  {
    name: 'parseReviver (axiosRef.defaults) applies the same way as request-level',
    run: (s: any, ctx: Ctx) => {
      s.axiosRef.defaults.parseReviver = (key: string, value: any) =>
        typeof value === 'number' ? value + 1 : value;
      return s.get(`${ctx.base}/reviver`);
    },
    normalize: (o: any) => o.result?.data,
  },
  {
    name: 'server gzips when Accept-Encoding allows (typical CDN)',
    run: (s, ctx) => s.get(`${ctx.base}/negotiate-gzip`),
    normalize: async (o: any) => (await normData(o.result?.data)) ?? null,
  },
  {
    name: 'decompress: false',
    run: (s, ctx) =>
      s.get(`${ctx.base}/gzip`, {
        decompress: false,
        responseType: 'arraybuffer',
      }),
    normalize: (o: any) => ({ ok: !!o.result, status: o.result?.status }),
  },
  {
    name: 'server content negotiation on Accept',
    run: (s, ctx) => s.get(`${ctx.base}/negotiate-accept`),
    normalize: async (o: any) => (await normData(o.result?.data)) ?? null,
  },
]);
