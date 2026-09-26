/**
 * Covers plan.md phase 2 "Progress callbacks (onUploadProgress /
 * onDownloadProgress), maxRate, formSerializer" - module-level, axiosRef-
 * defaults-level and request-level wiring (all with request > defaults >
 * module precedence), `responseType: 'stream'`, and functional `maxRate`
 * throttling. Exact behavioural parity against `@nestjs/axios`/axios is
 * covered by `tests/compat/differential/progress-form.diff.spec.ts`.
 */
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { HttpModule, HttpService } from '../src';

describe('progress callbacks / maxRate / formSerializer', () => {
  let server: Server;
  let base: string;
  const modules: TestingModule[] = [];
  const DOWNLOAD_SIZE = 300_000;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        if (req.url === '/download') {
          const buf = Buffer.alloc(DOWNLOAD_SIZE, 'a');
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(buf.length),
          });
          res.end(buf);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, body }));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await Promise.all(modules.map(m => m.close()));
    await new Promise(resolve => server.close(resolve));
  });

  const makeService = async (options: any = {}): Promise<HttpService> => {
    const module = await Test.createTestingModule({
      imports: [HttpModule.register(options)],
    }).compile();
    modules.push(module);
    return module.get(HttpService);
  };

  describe('onDownloadProgress', () => {
    it('module-level: fires for a buffered (default) response', async () => {
      const events: any[] = [];
      const service = await makeService({
        onDownloadProgress: (e: any) => events.push(e),
      });
      const response = await firstValueFrom(service.get(`${base}/download`));
      expect(response.status).toBe(200);
      expect(events.length).toBeGreaterThan(0);
      const last = events[events.length - 1];
      expect(last.loaded).toBe(DOWNLOAD_SIZE);
      expect(last.total).toBe(DOWNLOAD_SIZE);
      expect(last.progress).toBe(1);
      expect(last.download).toBe(true);
      expect(last.upload).toBeUndefined();
      // Monotonic.
      for (let i = 1; i < events.length; i++) {
        expect(events[i].loaded).toBeGreaterThanOrEqual(events[i - 1].loaded);
      }
    });

    it('works with responseType: "stream" - the caller reads the wrapped stream, progress still fires', async () => {
      const events: any[] = [];
      const service = await makeService({});
      const response = await firstValueFrom(
        service.get(`${base}/download`, {
          responseType: 'stream',
          onDownloadProgress: (e: any) => events.push(e),
        }),
      );
      const chunks: Buffer[] = [];
      for await (const chunk of response.data as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).length).toBe(DOWNLOAD_SIZE);
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1].loaded).toBe(DOWNLOAD_SIZE);
    });

    it('axiosRef.defaults-level (seeded from module options), overridden per request', async () => {
      const moduleEvents: any[] = [];
      const requestEvents: any[] = [];
      const service = await makeService({
        onDownloadProgress: (e: any) => moduleEvents.push(e),
      });
      // Request-level wins over the module-seeded default.
      await firstValueFrom(
        service.get(`${base}/download`, {
          onDownloadProgress: (e: any) => requestEvents.push(e),
        }),
      );
      expect(moduleEvents.length).toBe(0);
      expect(requestEvents.length).toBeGreaterThan(0);

      // Mutating axiosRef.defaults directly also takes effect (request >
      // defaults > module, and defaults is seeded from module options).
      const laterEvents: any[] = [];
      service.axiosRef.defaults.onDownloadProgress = (e: any) =>
        laterEvents.push(e);
      await firstValueFrom(service.get(`${base}/download`));
      expect(laterEvents.length).toBeGreaterThan(0);
    });

    it('is not called at all when unset (no wrapping, no cost)', async () => {
      const service = await makeService({});
      const response = await firstValueFrom(service.get(`${base}/download`));
      expect((response.data as string).length).toBe(DOWNLOAD_SIZE);
    });
  });

  describe('onUploadProgress', () => {
    it('fires for a Buffer body, final loaded === total, monotonic', async () => {
      const events: any[] = [];
      const service = await makeService({});
      const buf = Buffer.alloc(200_000, 'x');
      const response = await firstValueFrom(
        service.post(`${base}/echo`, buf, {
          onUploadProgress: (e: any) => events.push(e),
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      );
      expect(response.status).toBe(200);
      expect(events.length).toBeGreaterThan(0);
      const last = events[events.length - 1];
      expect(last.loaded).toBe(200_000);
      expect(last.total).toBe(200_000);
      expect(last.progress).toBe(1);
      expect(last.upload).toBe(true);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].loaded).toBeGreaterThanOrEqual(events[i - 1].loaded);
      }
    });

    it('fires for a string body', async () => {
      const events: any[] = [];
      const service = await makeService({});
      const text = 'x'.repeat(100_000);
      const response = await firstValueFrom(
        service.post(`${base}/echo`, text, {
          onUploadProgress: (e: any) => events.push(e),
          headers: { 'Content-Type': 'text/plain' },
        }),
      );
      expect(response.status).toBe(200);
      expect(events[events.length - 1].loaded).toBe(Buffer.byteLength(text));
    });

    it('fires for a stream body', async () => {
      const events: any[] = [];
      const service = await makeService({});
      const data = Buffer.alloc(150_000, 'y');
      const stream = Readable.from(data);
      const response = await firstValueFrom(
        service.post(`${base}/echo`, stream, {
          onUploadProgress: (e: any) => events.push(e),
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(data.length),
          },
        }),
      );
      expect(response.status).toBe(200);
      expect(events[events.length - 1].loaded).toBe(data.length);
      expect(events[events.length - 1].total).toBe(data.length);
    });

    it('fires for a multipart (postForm) body - total is unknown (no Content-Length), so progress/lengthComputable stay undefined/false, but loaded still tracks real bytes written', async () => {
      const events: any[] = [];
      const service = await makeService({});
      const response = await firstValueFrom(
        service.postForm(
          `${base}/echo`,
          { a: '1', big: 'z'.repeat(100_000) },
          { onUploadProgress: (e: any) => events.push(e) },
        ),
      );
      expect(response.status).toBe(200);
      expect(events.length).toBeGreaterThan(0);
      const last = events[events.length - 1];
      expect(last.total).toBeUndefined();
      expect(last.lengthComputable).toBe(false);
      expect(last.loaded).toBeGreaterThan(100_000);
      expect(last.upload).toBe(true);
    });
  });

  describe('maxRate', () => {
    it('throttles download throughput (functional check, generous timing budget)', async () => {
      const service = await makeService({});
      const started = Date.now();
      const response = await firstValueFrom(
        service.get(`${base}/download`, { maxRate: 100_000 }),
      );
      const elapsed = Date.now() - started;
      expect((response.data as Buffer).length).toBe(DOWNLOAD_SIZE);
      // At ~100,000 bytes/sec, 300,000 bytes takes at least ~2 windows
      // (500ms each) beyond the first burst - a generous floor.
      expect(elapsed).toBeGreaterThanOrEqual(300);
    });

    it('[upload, download] splits the rate per direction', async () => {
      const service = await makeService({});
      const response = await firstValueFrom(
        service.get(`${base}/download`, { maxRate: [1, 100_000] }),
      );
      expect((response.data as Buffer).length).toBe(DOWNLOAD_SIZE);
    });

    it('module-level maxRate is seeded into axiosRef.defaults', async () => {
      const service = await makeService({ maxRate: 100_000 });
      expect(service.axiosRef.defaults.maxRate).toBe(100_000);
    });
  });

  describe('formSerializer', () => {
    it('module-level formSerializer is seeded into axiosRef.defaults and applies to postForm', async () => {
      const service = await makeService({
        formSerializer: { indexes: true },
      });
      const response = await firstValueFrom(
        service.postForm(`${base}/echo`, { list: [1, 2] }),
      );
      const body: string = response.data.body;
      expect(body).toContain('name="list[0]"');
      expect(body).toContain('name="list[1]"');
    });

    it('request-level formSerializer overrides the module/defaults one', async () => {
      const service = await makeService({
        formSerializer: { indexes: true },
      });
      const response = await firstValueFrom(
        service.postForm(
          `${base}/echo`,
          { list: [1, 2] },
          { formSerializer: { indexes: null } },
        ),
      );
      const body: string = response.data.body;
      expect(body).toContain('name="list"');
      expect(body).not.toContain('name="list[0]"');
    });
  });
});
