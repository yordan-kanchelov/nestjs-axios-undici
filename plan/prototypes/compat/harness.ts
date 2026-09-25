/**
 * Differential test harness: runs the same call through @nestjs/axios (real
 * axios) and nestjs-axios-undici against one local node:http server and
 * returns normalized outcomes that can be compared with `toEqual`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  HttpModule as AxiosHttpModule,
  HttpService as AxiosHttpService,
} from '@nestjs/axios';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { firstValueFrom, Observable } from 'rxjs';
import {
  HttpModule as UndiciHttpModule,
  HttpService as UndiciHttpService,
} from '../../src';

export type Recorded = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawHeaders: string[];
  body: Buffer;
  aborted: boolean;
  closedAt?: number;
};

export const recorded: Recorded[] = [];

type Handler = (req: IncomingMessage, res: ServerResponse, body: Buffer) => void;

const q = (req: IncomingMessage) => new URL(req.url!, 'http://x').searchParams;

export const routes: Record<string, Handler> = {
  '/echo': (req, res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body.toString('utf8'),
      }),
    );
  },
  // /raw?status=200&ct=text/plain&body=...&b64=...
  '/raw': (req, res) => {
    const p = q(req);
    const status = Number(p.get('status') || 200);
    const headers: Record<string, string> = {};
    if (p.has('ct')) headers['Content-Type'] = p.get('ct')!;
    if (p.has('reason')) res.statusMessage = p.get('reason')!;
    const body = p.has('b64')
      ? Buffer.from(p.get('b64')!, 'base64')
      : Buffer.from(p.get('body') ?? '');
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' || status === 204 || status === 304 ? undefined : body);
  },
  '/multi-headers': (_req, res) => {
    res.setHeader('Set-Cookie', ['a=1; Path=/', 'b=2; Path=/']);
    res.setHeader('X-Dup', ['one', 'two']);
    res.setHeader('X-Camel-Case', 'Val');
    res.setHeader('Content-Type', 'application/json');
    res.end('{"ok":true}');
  },
  // /redirect?code=302&to=/echo
  '/redirect': (req, res) => {
    const p = q(req);
    res.writeHead(Number(p.get('code') || 302), { Location: p.get('to') || '/echo' });
    res.end();
  },
  '/redirect-loop': (_req, res) => {
    res.writeHead(302, { Location: '/redirect-loop' });
    res.end();
  },
  '/slow': (req, res) => {
    const ms = Number(q(req).get('ms') || 2000);
    const t = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('late');
    }, ms);
    res.on('close', () => clearTimeout(t));
  },
  // headers immediately, body trickles slowly
  '/slow-body': (req, res) => {
    const ms = Number(q(req).get('ms') || 2000);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write('a');
    const t = setTimeout(() => res.end('b'), ms);
    res.on('close', () => clearTimeout(t));
  },
  '/gzip': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
    res.end(gzipSync('{"z":"gzip"}'));
  },
  '/br': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'br' });
    res.end(brotliCompressSync('{"z":"br"}'));
  },
  '/deflate': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'deflate' });
    res.end(deflateSync('{"z":"deflate"}'));
  },
  // honours Accept-Encoding like a typical CDN/nginx would
  '/negotiate-gzip': (req, res) => {
    if (String(req.headers['accept-encoding'] || '').includes('gzip')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' });
      res.end(gzipSync('{"z":"gzip"}'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"z":"plain"}');
    }
  },
  // content negotiation on Accept (e.g. Rails/Spring/Express res.format)
  '/negotiate-accept': (req, res) => {
    if (String(req.headers.accept || '').includes('application/json')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"format":"json"}');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>html</html>');
    }
  },
  '/set-cookie': (_req, res) => {
    res.setHeader('Set-Cookie', 'sid=abc; Path=/');
    res.end('ok');
  },
  '/big': (req, res) => {
    const n = Number(q(req).get('n') || 1000);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('x'.repeat(n));
  },
  '/big-chunked': (req, res) => {
    const n = Number(q(req).get('n') || 1000);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.write('x'.repeat(n / 2));
    res.end('x'.repeat(n / 2));
  },
  '/destroy': (req) => {
    req.socket.destroy();
  },
};

let server: Server;
export let base = '';

export async function startServer(): Promise<void> {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    const rec: Recorded = {
      method: req.method!,
      url: req.url!,
      headers: req.headers,
      rawHeaders: req.rawHeaders,
      body: Buffer.alloc(0),
      aborted: false,
    };
    recorded.push(rec);
    req.on('data', c => chunks.push(c));
    res.on('close', () => {
      rec.closedAt = Date.now();
      if (!res.writableFinished) rec.aborted = true;
    });
    req.on('end', () => {
      rec.body = Buffer.concat(chunks);
      const path = new URL(req.url!, 'http://x').pathname;
      const handler =
        routes[path] ??
        Object.entries(routes).find(([p]) => path.startsWith(p + '/'))?.[1] ??
        routes['/echo'];
      handler(req, res, rec.body);
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function stopServer(): Promise<void> {
  server.closeAllConnections?.();
  await new Promise(r => server.close(r));
}

const modules: TestingModule[] = [];

export type Pair = { a: AxiosHttpService; u: UndiciHttpService };

/** Both services, registered with the same module options. */
export async function pair(options?: any, undiciOptions?: any): Promise<Pair> {
  const ma = await Test.createTestingModule({
    // register() always: plain `HttpModule` in @nestjs/axios shares the global axios instance
    imports: [AxiosHttpModule.register(options ?? {})],
  }).compile();
  const mu = await Test.createTestingModule({
    imports: [
      UndiciHttpModule.register({ ...options, ...undiciOptions }),
    ],
  }).compile();
  modules.push(ma, mu);
  return { a: ma.get(AxiosHttpService), u: mu.get(UndiciHttpService) };
}

export async function closeModules(): Promise<void> {
  await Promise.all(modules.splice(0).map(m => m.close()));
}

async function readStream(s: any): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

export async function normData(data: any): Promise<any> {
  if (Buffer.isBuffer(data)) return { $buffer: data.toString('utf8') };
  if (data instanceof ArrayBuffer) return { $arraybuffer: Buffer.from(data).toString('utf8') };
  if (typeof Blob !== 'undefined' && data instanceof Blob)
    return { $blob: await data.text() };
  if (data && typeof data.pipe === 'function')
    return { $stream: await readStream(data) };
  return data;
}

export const IGNORED_HEADERS = new Set(['date', 'connection', 'keep-alive', 'transfer-encoding']);

export function normHeaders(h: any): Record<string, any> {
  const plain = h && typeof h.toJSON === 'function' ? h.toJSON() : { ...h };
  const out: Record<string, any> = {};
  for (const k of Object.keys(plain).sort())
    if (!IGNORED_HEADERS.has(k.toLowerCase())) out[k] = plain[k];
  return out;
}

export type Outcome =
  | { ok: true; status: number; statusText: string; data: any; headers?: any }
  | {
      ok: false;
      name: string;
      code?: string;
      message: string;
      status?: number;
      isAxiosError?: boolean;
      responseData?: any;
      hasConfig?: boolean;
      hasRequest?: boolean;
      hasResponse?: boolean;
    };

export async function outcome(
  o: Observable<any> | Promise<any>,
  { headers = false }: { headers?: boolean } = {},
): Promise<Outcome> {
  try {
    const r = await (o instanceof Observable ? firstValueFrom(o) : o);
    const res: Outcome = {
      ok: true,
      status: r.status,
      statusText: r.statusText,
      data: await normData(r.data),
    };
    if (headers) (res as any).headers = normHeaders(r.headers);
    return res;
  } catch (e: any) {
    return {
      ok: false,
      name: e?.name,
      code: e?.code,
      message: e?.message,
      status: e?.status,
      isAxiosError: e?.isAxiosError,
      responseData: e?.response ? await normData(e.response.data) : undefined,
      hasConfig: !!e?.config,
      hasRequest: !!e?.request,
      hasResponse: !!e?.response,
    };
  }
}

/** What the server saw for the last request (method, url, selected headers, body). */
export function serverView(
  r: Recorded | undefined,
  headerNames: string[] = ['content-type', 'content-length', 'transfer-encoding', 'authorization'],
) {
  if (!r) return undefined;
  const headers: Record<string, any> = {};
  for (const n of headerNames) if (r.headers[n] !== undefined) headers[n] = r.headers[n];
  return { method: r.method, url: r.url, headers, body: r.body.toString('utf8') };
}

/** Runs `call` on both services; returns outcome + server view for each. */
export async function both(
  p: Pair,
  call: (s: any) => Observable<any> | Promise<any>,
  opts: { headers?: boolean; serverHeaders?: string[] } = {},
) {
  const res: any = {};
  for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
    const before = recorded.length;
    const out = await outcome(call(s), opts);
    const reqs = recorded.slice(before).map(r => serverView(r, opts.serverHeaders));
    res[k] = { out, server: reqs.length <= 1 ? reqs[0] : reqs };
  }
  return res as { axios: any; undici: any };
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export { Readable };
