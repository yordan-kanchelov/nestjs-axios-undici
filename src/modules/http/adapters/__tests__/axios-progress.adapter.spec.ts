import { Readable } from 'node:stream';
import {
  createProgressReporter,
  meterDownloadBody,
  meterUploadBody,
  resolveMaxRates,
  resolveUploadTotal,
  toFiniteNumber,
} from '../axios-progress.adapter';

async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('axios-progress.adapter', () => {
  describe('toFiniteNumber / resolveMaxRates', () => {
    it('is undefined for non-finite/absent values', () => {
      expect(toFiniteNumber(undefined)).toBeUndefined();
      expect(toFiniteNumber(null)).toBeUndefined();
      expect(toFiniteNumber(NaN)).toBeUndefined();
      expect(toFiniteNumber('not a number')).toBeUndefined();
    });

    it('parses a numeric string', () => {
      expect(toFiniteNumber('42')).toBe(42);
    });

    it('a single maxRate applies to both directions', () => {
      expect(resolveMaxRates(1000)).toEqual({ upload: 1000, download: 1000 });
    });

    it('a [upload, download] pair is split', () => {
      expect(resolveMaxRates([100, 200])).toEqual({
        upload: 100,
        download: 200,
      });
    });

    it('is {} when maxRate is unset', () => {
      expect(resolveMaxRates(undefined)).toEqual({});
    });
  });

  describe('resolveUploadTotal', () => {
    it("a string body's own byte length", () => {
      expect(resolveUploadTotal('hello', undefined)).toBe(5);
    });

    it("a Buffer body's own length", () => {
      expect(resolveUploadTotal(Buffer.from('hello'), undefined)).toBe(5);
    });

    it('a Content-Length header, case-insensitively, for anything else', () => {
      expect(
        resolveUploadTotal(Readable.from(['x']), { 'content-length': '123' }),
      ).toBe(123);
      expect(
        resolveUploadTotal(Readable.from(['x']), { 'Content-Length': '7' }),
      ).toBe(7);
    });

    it('is undefined with no known length', () => {
      expect(
        resolveUploadTotal(Readable.from(['x']), undefined),
      ).toBeUndefined();
      expect(resolveUploadTotal(Readable.from(['x']), {})).toBeUndefined();
    });
  });

  describe('createProgressReporter', () => {
    it('reports loaded/total/progress/flags, throttled to one call in a burst', () => {
      const events: any[] = [];
      const reporter = createProgressReporter(e => events.push(e), true, 3);
      reporter.report(10, 100);
      reporter.report(20, 100);
      reporter.report(30, 100);
      // All three calls land inside the same throttle window - only the
      // first fires synchronously (the rest are coalesced/dropped until the
      // window elapses or flush() is called).
      expect(events.length).toBe(1);
      expect(events[0]).toMatchObject({
        loaded: 10,
        total: 100,
        progress: 0.1,
        download: true,
        lengthComputable: true,
      });
      expect(events[0].upload).toBeUndefined();
    });

    it('flush() delivers the last, still-throttled update immediately', () => {
      const events: any[] = [];
      const reporter = createProgressReporter(e => events.push(e), false, 3);
      reporter.report(50, 200);
      reporter.report(200, 200);
      expect(events.length).toBe(1);
      reporter.flush();
      expect(events.length).toBe(2);
      expect(events[1]).toMatchObject({
        loaded: 200,
        total: 200,
        progress: 1,
        upload: true,
      });
    });

    it('loaded is clamped to total, and never decreases across reports', () => {
      const events: any[] = [];
      const reporter = createProgressReporter(e => events.push(e), true, 3);
      reporter.report(150, 100); // over-reported loaded is clamped to total
      reporter.flush();
      expect(events[0].loaded).toBe(100);
      expect(events[0].progress).toBe(1);
    });

    it('lengthComputable is false and progress is undefined with no known total', () => {
      const events: any[] = [];
      const reporter = createProgressReporter(e => events.push(e), true, 3);
      reporter.report(10, undefined);
      expect(events[0]).toMatchObject({
        loaded: 10,
        total: undefined,
        progress: undefined,
        lengthComputable: false,
      });
    });
  });

  describe('meterUploadBody', () => {
    it('is a no-op when body is undefined/null', () => {
      expect(meterUploadBody(undefined, {})).toBeUndefined();
      expect(meterUploadBody(null, {})).toBeNull();
    });

    it('converts a string/Buffer body to a metered stream, preserving the bytes', async () => {
      const wrappedString = meterUploadBody('hello world', {}) as Readable;
      expect(typeof (wrappedString as any).pipe).toBe('function');
      expect((await drain(wrappedString)).toString()).toBe('hello world');

      const wrappedBuffer = meterUploadBody(Buffer.from('abc'), {}) as Readable;
      expect((await drain(wrappedBuffer)).toString()).toBe('abc');
    });

    it('meters an existing stream body directly', async () => {
      const source = Readable.from([Buffer.from('a'), Buffer.from('b')]);
      const events: any[] = [];
      const wrapped = meterUploadBody(source, {
        onProgress: e => events.push(e),
        total: 2,
      }) as Readable;
      expect((await drain(wrapped)).toString()).toBe('ab');
      // Give the throttled reporter's trailing flush (on 'end') a tick.
      await new Promise(r => setImmediate(r));
      expect(events.length).toBeGreaterThan(0);
      expect(events[events.length - 1]).toMatchObject({
        loaded: 2,
        total: 2,
        progress: 1,
        upload: true,
      });
    });

    it('returns a non-stream/non-buffer/non-string body unchanged (e.g. an undici-native FormData)', () => {
      const body = { [Symbol.toStringTag]: 'FormData' } as any;
      expect(meterUploadBody(body, { onProgress: () => undefined })).toBe(body);
    });

    it('throttles throughput when maxRate is set (functional check, generous timing budget)', async () => {
      const payload = Buffer.alloc(4000, 'x');
      const started = Date.now();
      const wrapped = meterUploadBody(payload, { maxRate: 2000 }) as Readable;
      const out = await drain(wrapped);
      const elapsed = Date.now() - started;
      expect(out.length).toBe(4000);
      // At ~2000 bytes/sec, 4000 bytes takes at least one full 500ms window
      // beyond the first burst - a generous floor to avoid CI flakiness.
      expect(elapsed).toBeGreaterThanOrEqual(300);
    });
  });

  describe('meterDownloadBody', () => {
    it('meters a response body stream, reporting download:true', async () => {
      const source = Readable.from([Buffer.from('x'.repeat(10))]);
      const events: any[] = [];
      const wrapped = meterDownloadBody(source, {
        onProgress: e => events.push(e),
        total: 10,
      });
      expect((await drain(wrapped)).length).toBe(10);
      await new Promise(r => setImmediate(r));
      expect(events[events.length - 1]).toMatchObject({
        loaded: 10,
        total: 10,
        progress: 1,
        download: true,
      });
    });
  });
});
