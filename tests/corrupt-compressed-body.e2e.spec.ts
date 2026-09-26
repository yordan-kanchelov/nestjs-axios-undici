/**
 * Real-server test for plan.md phase 2 "corrupt/truncated compressed body":
 * a server that claims `Content-Encoding: gzip` but sends bytes that
 * aren't gzip at all used to surface the raw zlib error (`Z_DATA_ERROR`,
 * ...) unwrapped - no `isAxiosError`/`config`/`request`. axios wraps it via
 * `AxiosError.from(err, null, config, lastRequest, response)`; this now
 * matches, for both buffered and `responseType: 'stream'` (see
 * `wrapStreamCancellation`'s doc comment in `axios-response.adapter.ts`).
 *
 * A body that's merely *truncated* mid-stream (a valid gzip header, cut off
 * before the end) is a separate case, covered here too: axios' own
 * flush-tolerant zlib options (`finishFlush: Z_SYNC_FLUSH` etc. -
 * `GZIP_FLUSH_OPTIONS` in `axios-response-type.adapter.ts`, checked against
 * real axios 1.20's own `zlibOptions`) mean this never throws at all,
 * resolving with whatever could be decoded from the partial bytes instead -
 * confirmed directly against `gunzipSync` with axios' own flush options.
 * Without this, this library's *own* corrupt-body wrapping (above) would
 * have started wrapping this case as an AxiosError too, a regression from
 * axios' real behaviour caught by the axios upstream conformance suite's
 * "should not fail with an empty response (with|without) content-length
 * header (Z_BUF_ERROR)" (a degenerate, zero-byte case of exactly this).
 *
 * See also the deterministic, in-process unit tests in
 * `axios-response.adapter.spec.ts` and `axios-response-type.adapter.spec.ts`.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { firstValueFrom } from 'rxjs';
import { HttpModule, HttpService } from '../src';

describe('corrupt/truncated compressed body (real server)', () => {
  let server: Server;
  let baseUrl: string;
  let service: HttpService;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const p = new URL(req.url!, 'http://x').searchParams;
      const kind = p.get('kind');
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      if (kind === 'garbage') {
        res.end('this is definitely not gzip data');
      } else if (kind === 'truncated') {
        const full = gzipSync(Buffer.alloc(50_000, 'z'));
        res.end(full.subarray(0, full.length - 30));
      } else if (kind === 'empty') {
        res.end();
      } else {
        res.end('{}');
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({})],
    }).compile();
    service = module.get<HttpService>(HttpService);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('buffered: genuinely-corrupt (not-gzip-at-all) data rejects with a real AxiosError, not the raw zlib error', async () => {
    let caught: any;
    try {
      await firstValueFrom(service.request(`${baseUrl}?kind=garbage`));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
    expect(caught.isAxiosError).toBe(true);
    expect(caught.config).toBeTruthy();
    expect(typeof caught.code).toBe('string');
    expect(caught.request).toBeTruthy();
    // The real value-add here: axios attaches `response` (status/headers/
    // config/request) even for a buffered read that failed to decode -
    // `AxiosError.from(err, null, config, lastRequest, response)` in
    // `lib/adapters/http.js`'s `handleStreamError`. Before this fix, this
    // library's fallback error-shaping (`toAxiosError`'s generic branch)
    // already gave `isAxiosError`/`code`/`request`, but never `response`.
    expect(caught.response).toBeTruthy();
    expect(caught.response.status).toBe(200);
  });

  it('responseType: "stream": genuinely-corrupt (not-gzip-at-all) data errors with a real AxiosError, not the raw zlib error', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}?kind=garbage`, { responseType: 'stream' }),
    );
    let caught: any;
    try {
      for await (const _chunk of response.data as Readable) {
        // drain
      }
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
    expect(caught.isAxiosError).toBe(true);
    expect(caught.config).toBeTruthy();
    expect(typeof caught.code).toBe('string');
  });

  it('buffered: a body truncated mid-stream does not reject, matching axios’ flush-tolerant zlib options', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}?kind=truncated`),
    );
    expect(response.status).toBe(200);
    expect(typeof response.data).toBe('string');
  });

  it('responseType: "stream": a body truncated mid-stream does not error, matching axios’ flush-tolerant zlib options', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}?kind=truncated`, {
        responseType: 'stream',
      }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of response.data as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('an empty (zero-byte) gzip-encoded response resolves with an empty string, not Z_BUF_ERROR', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}?kind=empty`),
    );
    expect(response.data).toBe('');
  });
});
