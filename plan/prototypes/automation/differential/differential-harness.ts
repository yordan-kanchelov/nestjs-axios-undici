/**
 * Table-driven differential harness: every case runs through @nestjs/axios (real axios)
 * and nestjs-axios-undici against the same local server; the normalized outcome
 * (what the server saw + what the caller got) must be equal, unless the case is listed
 * as a known difference, in which case the test asserts the difference still exists
 * (fixing it turns the test red, so the doc + table get updated).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpModule as AxiosHttpModule, HttpService as AxiosHttpService } from '@nestjs/axios';
import axios from 'axios';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { firstValueFrom, isObservable } from 'rxjs';
import { HttpModule as UndiciHttpModule, HttpService as UndiciHttpService } from '../../src';

export type Seen = { method: string; url: string; headers: Record<string, any>; body: string };
export type Ctx = { base: string; other: string; seen: Seen[] };
export type Outcome = { requests: Seen[]; result?: any; error?: any };
export type Case = {
  name: string;
  module?: (ctx: Ctx) => Record<string, any>;
  run: (s: any, ctx: Ctx) => any; // Observable | Promise
  /** Pick what to compare; default: requests (method/url/body/selected headers) + response/error summary */
  normalize?: (o: Outcome, ctx: Ctx) => any;
  /** Known difference: reason (doc link); the harness asserts outcomes differ */
  knownDifference?: string;
  /** Only run when the reference supports it (e.g. HttpService.query in @nestjs/axios >= 12) */
  skipIf?: (ref: any) => boolean;
};

const HEADERS = ['content-type', 'content-length', 'authorization', 'accept', 'x-a', 'x-b', 'cookie'];
export const pickHeaders = (h: Record<string, any>) => Object.fromEntries(HEADERS.filter(k => h[k] !== undefined).map(k => [k, h[k]]));
export const summarizeResponse = (r: any) => r && ({
  status: r.status, statusText: r.statusText, data: Buffer.isBuffer(r.data) ? `<Buffer ${r.data.toString()}>` : r.data,
  headers: { 'content-type': r.headers?.['content-type'], 'set-cookie': r.headers?.['set-cookie'], location: r.headers?.location },
});
export const summarizeError = (e: any) => e && ({
  name: e.name, message: e.message, code: e.code, status: e.status, isAxiosError: axios.isAxiosError(e), isCancel: axios.isCancel(e),
  response: summarizeResponse(e.response), hasConfig: !!e.config, hasRequest: !!e.request,
});
const defaultNormalize = (o: Outcome) => ({
  requests: o.requests.map(r => ({ method: r.method, url: r.url, body: r.body, headers: pickHeaders(r.headers) })),
  result: summarizeResponse(o.result), error: summarizeError(o.error),
});

export type Route = (req: IncomingMessage, res: ServerResponse, body: string, ctx: Ctx) => void;

export function differential(title: string, routes: Record<string, Route>, cases: Case[]) {
  describe(title, () => {
    const ctx: Ctx = { base: '', other: '', seen: [] };
    const servers: Server[] = [];
    const modules: TestingModule[] = [];
    const start = async () => {
      const server = createServer((req, res) => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
          ctx.seen.push({ method: req.method!, url: req.url!, headers: req.headers, body });
          const path = new URL(req.url!, 'http://x').pathname;
          const key = Object.keys(routes).sort((a, b) => b.length - a.length).find(k => path === k || path.startsWith(`${k}/`));
          if (key) return routes[key](req, res, body, ctx);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
      });
      await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
      servers.push(server);
      return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    };
    beforeAll(async () => {
      ctx.base = await start();
      // Second origin, for cross-origin redirect cases
      ctx.other = (await start()).replace('127.0.0.1', 'localhost');
    });
    afterAll(async () => {
      await Promise.all(modules.map(m => m.close()));
      for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
    });
    const service = async (Mod: any, Svc: any, options: any) => {
      const m = await Test.createTestingModule({ imports: [Mod.register(options ?? {})] }).compile();
      modules.push(m);
      return m.get(Svc);
    };
    const exec = async (s: any, c: Case): Promise<Outcome> => {
      ctx.seen = [];
      const o: Outcome = { requests: ctx.seen };
      try {
        const v = c.run(s, ctx);
        o.result = isObservable(v) ? await firstValueFrom(v) : await v;
      } catch (e) { o.error = e; }
      return o;
    };
    for (const c of cases) {
      it(c.knownDifference ? `known difference: ${c.name}` : c.name, async () => {
        const opts = c.module?.(ctx);
        const ref = await service(AxiosHttpModule, AxiosHttpService, opts);
        if (c.skipIf?.(ref)) return;
        const ours = await service(UndiciHttpModule, UndiciHttpService, opts);
        const norm = c.normalize ?? defaultNormalize;
        const a = norm(await exec(ref, c), ctx);
        const u = norm(await exec(ours, c), ctx);
        if (process.env.DIFF_REPORT) require('node:fs').appendFileSync(process.env.DIFF_REPORT, JSON.stringify({ name: c.name, a, u }) + '\n');
        if (c.knownDifference) expect(u).not.toEqual(a);
        else expect(u).toEqual(a);
      });
    }
  });
}
