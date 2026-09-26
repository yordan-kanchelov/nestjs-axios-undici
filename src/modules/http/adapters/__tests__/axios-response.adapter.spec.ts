import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import {
  RequestInfo,
  resolveIsValidStatus,
  toAxiosLikeResponse,
} from '../axios-response.adapter';
import type { HttpInterceptorRequest } from '../../interfaces/http-interceptor.interface';

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Resolves once `stream` emits `'close'` (or immediately if it's already destroyed) - `destroy()` schedules `'close'` asynchronously, so a disposal assertion right after calling it needs to wait for this instead of racing it. */
function onceClosed(stream: {
  destroyed?: boolean;
  once(event: 'close', listener: () => void): unknown;
}): Promise<void> {
  return new Promise(resolve => {
    if (stream.destroyed) {
      resolve();
      return;
    }
    stream.once('close', () => resolve());
  });
}

/**
 * A `Readable` that pushes `chunks` one at a time, a tick apart, instead of
 * handing the whole payload to a `.pipe()` destination in one synchronous
 * go - `Readable.from([buffer])` (a single, already-fully-buffered chunk)
 * drains into a small `.pipe()` destination's internal buffer immediately
 * regardless of how slowly (or whether at all) anything downstream actually
 * reads it, so it reaches its own natural `'end'`/`'close'` on its own -
 * without ever exercising the destroy-*propagation* this file's disposal
 * tests are actually about. This instead stays genuinely open (like a real,
 * live socket under backpressure) until something explicitly destroys it.
 */
function slowReadable(chunks: Buffer[]): Readable {
  const stream = new Readable({ read() {} });
  let i = 0;
  const pushNext = (): void => {
    if (i >= chunks.length) {
      stream.push(null);
      return;
    }
    stream.push(chunks[i++]);
    setTimeout(pushNext, 10);
  };
  setTimeout(pushNext, 10);
  return stream;
}

/** Splits `buf` into `parts` roughly-equal pieces, for feeding `slowReadable` a payload across several slow chunks instead of one. */
function splitBuffer(buf: Buffer, parts: number): Buffer[] {
  const size = Math.ceil(buf.length / parts);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buf.length; offset += size) {
    chunks.push(buf.subarray(offset, offset + size));
  }
  return chunks;
}

describe('RequestInfo (perf: response.request / error.request built lazily)', () => {
  it('parses nothing in the constructor; a field is parsed only on first read, and cached after', () => {
    const OriginalURL = globalThis.URL;
    let parseCount = 0;
    class CountingURL extends OriginalURL {
      constructor(input: string | URL, base?: string | URL) {
        super(input as any, base as any);
        parseCount++;
      }
    }
    (globalThis as any).URL = CountingURL;
    try {
      const info = new RequestInfo('http://api.example.com/x?y=1', 'GET');
      expect(parseCount).toBe(0);

      expect(info.path).toBe('/x?y=1');
      expect(parseCount).toBe(1);

      // Further reads (any of the parsed fields) don't parse again.
      expect(info.host).toBe('api.example.com');
      expect(info.protocol).toBe('http:');
      expect(info.path).toBe('/x?y=1');
      expect(parseCount).toBe(1);
    } finally {
      (globalThis as any).URL = OriginalURL;
    }
  });

  it('method is read directly, with no parsing at all', () => {
    const info = new RequestInfo('not a url at all', 'POST');
    expect(info.method).toBe('POST');
    // An unparsable string leaves path/host/protocol undefined, matching
    // axios for a request that never got far enough to resolve one -
    // doesn't throw either.
    expect(info.path).toBeUndefined();
    expect(info.host).toBeUndefined();
    expect(info.protocol).toBeUndefined();
  });

  it('accepts a URL instance directly (no re-parsing needed/possible)', () => {
    const info = new RequestInfo(
      new URL('https://api.example.com:8443/a/b?c=1'),
      'GET',
    );
    expect(info.protocol).toBe('https:');
    expect(info.host).toBe('api.example.com');
    expect(info.path).toBe('/a/b?c=1');
  });

  it('accepts a UrlObject (pathname/search/protocol/hostname own fields)', () => {
    const info = new RequestInfo(
      { protocol: 'http:', hostname: 'x', pathname: '/p', search: '?s=1' },
      'GET',
    );
    expect(info.protocol).toBe('http:');
    expect(info.host).toBe('x');
    expect(info.path).toBe('/p?s=1');
  });

  it('res is undefined when no responseUrl source was given (e.g. a network/timeout error)', () => {
    const info = new RequestInfo('http://api/x', 'GET');
    expect(info.res).toBeUndefined();
  });

  it('res.responseUrl is computed from the responseUrl source, and cached (same reference) across reads', () => {
    const info = new RequestInfo('http://api/x', 'GET', 'http://api/final');
    const first = info.res;
    expect(first).toEqual({ responseUrl: 'http://api/final' });
    const second = info.res;
    // Same object reference both times - proves the result is memoized,
    // not recomputed (and re-allocated) on every read.
    expect(second).toBe(first);
  });

  it('res.responseUrl is built from the responseUrl source via urlToString, even for a non-string (URL/UrlObject) hop', () => {
    const info = new RequestInfo(
      'http://api/x',
      'GET',
      new URL('http://api/final?x=1'),
    );
    expect(info.res).toEqual({ responseUrl: 'http://api/final?x=1' });
  });
});

/**
 * Review fix (PR #30): a metered download (`onDownloadProgress`/download
 * `maxRate` set) silently succeeded with an empty body on a real stream
 * error (an abort, the source being destroyed, or - before the
 * `asyncDecorator` fix - a throwing `onDownloadProgress` callback itself),
 * instead of rejecting. `toAxiosLikeResponse`'s corrupt-gzip recovery
 * fallback (a second raw-text read) was never meant for a metered stream (a
 * plain `Transform`, not undici's own body - no `.bodyUsed`/`.text()`), and
 * silently swallowed every one of those into `parsedData = ''`.
 */
describe('toAxiosLikeResponse: metered body error propagation', () => {
  const fakeRequest = (
    options: Record<string, any>,
  ): HttpInterceptorRequest => ({
    url: 'http://localhost/test',
    options: { method: 'GET', ...options },
  });

  it('a source stream error while metered (onDownloadProgress) rejects, instead of falling back to an empty string', async () => {
    const source = new Readable({ read() {} });
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: source,
    };
    const promise = toAxiosLikeResponse(
      fakeRequest({ onDownloadProgress: () => undefined }),
      undiciResponse,
    );
    source.push(Buffer.from('{"partial":'));
    source.emit('error', new Error('socket hang up'));
    await expect(promise).rejects.toThrow('socket hang up');
  });

  it('a destroyed/aborted source stream while metered (maxRate) rejects, instead of resolving with an empty body', async () => {
    const source = new Readable({ read() {} });
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/octet-stream' },
      body: source,
    };
    const promise = toAxiosLikeResponse(
      fakeRequest({ maxRate: 1_000_000 }),
      undiciResponse,
    );
    source.destroy(new Error('aborted'));
    await expect(promise).rejects.toThrow('aborted');
  });

  it('a throwing onDownloadProgress callback is decoupled via process.nextTick, so it can never corrupt the response - matching real axios 1.20 (verified manually against it: the response resolves with the full, correct body, and the throw surfaces as a separate uncaughtException, entirely outside the response pipeline)', async () => {
    const payload = { hello: 'world', big: 'x'.repeat(500) };
    const bodyBuf = Buffer.from(JSON.stringify(payload));
    const source = Readable.from([bodyBuf]);
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'content-length': String(bodyBuf.length),
      },
      body: source,
    };

    // Intercepts the real `process.nextTick` so the deferred callback can be
    // invoked - and its throw safely caught - directly by this test, instead
    // of letting it actually escape as a real, process-wide uncaught
    // exception (which jest-circus attributes to whatever test happens to
    // still be running, regardless of any `process.on('uncaughtException')`
    // handler of the test's own - not a meaningful thing to assert on here).
    const scheduled: Array<() => void> = [];
    const realNextTick = process.nextTick;
    (process as any).nextTick = (cb: () => void) => scheduled.push(cb);
    try {
      const response = await toAxiosLikeResponse(
        fakeRequest({
          onDownloadProgress: () => {
            throw new Error('user callback boom');
          },
        }),
        undiciResponse,
      );
      // The response already resolved, fully intact, without the deferred
      // callback ever having run - proving it can't have any effect on it.
      expect(response.data).toEqual(payload);
      expect(scheduled.length).toBeGreaterThan(0);
      // Running the deferred callback now (as the real event loop would)
      // does throw, with the exact error the user's callback raised -
      // exactly what becomes an uncaught exception in a real process.
      expect(() => scheduled.forEach(fn => fn())).toThrow('user callback boom');
    } finally {
      process.nextTick = realNextTick;
    }
  });
});

/**
 * plan.md phase 2 "fix: enforce maxContentLength for responseType: 'stream'"
 * (found by upstream conformance): the stream branch used to return the
 * body untouched, so a streamed download had no cap at all despite
 * `maxContentLength` - checked against real axios 1.20 (`lib/adapters/
 * http.js`'s own streamed enforcement, `Readable.from(enforceMaxContent
 * Length(), ...)`).
 */
describe('toAxiosLikeResponse: maxContentLength for responseType: stream', () => {
  const fakeRequest = (
    options: Record<string, any>,
  ): HttpInterceptorRequest => ({
    url: 'http://localhost/test',
    options: { method: 'GET', responseType: 'stream', ...options },
  });

  it('a stream under the limit reads through untouched', async () => {
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      body: Readable.from([Buffer.from('hello')]),
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: 1000 }),
      undiciResponse,
    );
    await expect(readAll(response.data)).resolves.toEqual(Buffer.from('hello'));
  });

  it('a stream over the limit destroys with a real AxiosError (ERR_BAD_RESPONSE), matching axios exactly', async () => {
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      body: Readable.from([Buffer.alloc(10, 'x'), Buffer.alloc(10, 'y')]),
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: 15 }),
      undiciResponse,
    );
    const error: any = await readAll(response.data).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.isAxiosError).toBe(true);
    expect(error.code).toBe('ERR_BAD_RESPONSE');
    expect(error.message).toBe('maxContentLength size of 15 exceeded');
    // `config`/`request` are set eagerly on this error (unlike the buffered
    // case's `AxiosError`, which builds `config` lazily on read) - matches
    // axios' own streamed enforcement, which already has both in scope.
    expect(error.config).toBeDefined();
  });

  it('enforces the limit against the DECODED (decompressed) byte count, not the compressed one on the wire', async () => {
    const decoded = Buffer.alloc(1000, 'z');
    const compressed = gzipSync(decoded);
    // The compressed payload is well under the limit; only the decoded
    // (much larger) payload should trip it.
    expect(compressed.length).toBeLessThan(200);
    // Fed as several slow chunks (not one `Readable.from([compressed])`
    // buffer) so `body` is still genuinely open - mid-stream, not yet at its
    // own natural `'end'` - at the moment the limit trips; that's the only
    // way this test can tell an explicit `body.destroy()` apart from the
    // stream just finishing on its own, which is what let this bug slip
    // through the PR's original (single-chunk) version of this test.
    const body = slowReadable(splitBuffer(compressed, 4));
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-encoding': 'gzip' },
      body,
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: 200 }),
      undiciResponse,
    );
    const error: any = await readAll(response.data).catch(e => e);
    expect(error?.code).toBe('ERR_BAD_RESPONSE');
    expect(error?.message).toBe('maxContentLength size of 200 exceeded');
    // Review fix: `guardStreamMaxContentLength` used to destroy only the
    // decompressed (`.pipe()`-derived) stream, never the raw undici body
    // behind it - `.pipe()` never propagates destruction upstream, so the
    // raw body/socket stayed open under backpressure. It must be destroyed
    // too, or a real server connection would leak.
    await onceClosed(body);
    expect(body.destroyed).toBe(true);
  });

  it('unset/-1 maxContentLength never wraps the stream at all (same object identity as the raw body)', async () => {
    const body = Readable.from([Buffer.from('x')]);
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      body,
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: -1 }),
      undiciResponse,
    );
    expect(response.data).toBe(body);
  });

  it('an uncompressed stream over the limit destroys the raw body too (the already-working case, kept as a regression guard)', async () => {
    const body = Readable.from([Buffer.alloc(10, 'x'), Buffer.alloc(10, 'y')]);
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      body,
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: 15 }),
      undiciResponse,
    );
    await readAll(response.data).catch(() => undefined);
    await onceClosed(body);
    expect(body.destroyed).toBe(true);
  });

  /**
   * Review fix, same root cause, pre-existing on `claude/v1.0.0` before this
   * PR ever touched this file: a `responseType: 'stream'` consumer that
   * stops reading a *compressed* response early (no `maxContentLength`
   * involved at all) destroys the decompressed stream it was handed, but
   * the raw undici body/socket behind it never got destroyed either -
   * `decompressStream` (`axios-response-type.adapter.ts`) now wires that up
   * directly, so every consumer of a compressed `responseType: 'stream'`
   * response benefits, not just the `maxContentLength` path above.
   */
  it('a consumer destroying a compressed stream early also destroys the raw body', async () => {
    // Slow chunks again (see the limit-crossed test above): otherwise the
    // single already-buffered chunk drains into gunzip and `body` reaches
    // its own natural `'end'`/`'close'` before `.destroy()` below even runs,
    // so the assertion would pass whether or not destroy-propagation works.
    const body = slowReadable(
      splitBuffer(gzipSync(Buffer.alloc(1000, 'z')), 4),
    );
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-encoding': 'gzip' },
      body,
    };
    const response = await toAxiosLikeResponse(fakeRequest({}), undiciResponse);
    // A consumer that stops reading early - explicitly, not via a for-await
    // `break` (which would already trigger the async iterator's own
    // `return()`/`destroy()`, muddying which mechanism is under test here).
    (response.data as any).destroy();
    await onceClosed(body);
    expect(body.destroyed).toBe(true);
  });

  it('a consumer destroying an uncompressed stream early also destroys the raw body (the already-working case, kept as a regression guard)', async () => {
    const body = Readable.from([Buffer.alloc(1000, 'z')]);
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: {},
      body,
    };
    const response = await toAxiosLikeResponse(fakeRequest({}), undiciResponse);
    (response.data as any).destroy();
    await onceClosed(body);
    expect(body.destroyed).toBe(true);
  });
});

describe('resolveIsValidStatus', () => {
  it('defaults to the 2xx range with no validateStatus at all', () => {
    expect(resolveIsValidStatus(undefined, 200)).toBe(true);
    expect(resolveIsValidStatus({}, 404)).toBe(false);
  });

  it('a function validateStatus decides outright', () => {
    expect(resolveIsValidStatus({ validateStatus: () => true }, 500)).toBe(
      true,
    );
    expect(resolveIsValidStatus({ validateStatus: () => false }, 200)).toBe(
      false,
    );
  });

  it('validateStatus present as an own key (even null/undefined) always resolves, matching axios settle()', () => {
    expect(resolveIsValidStatus({ validateStatus: null }, 500)).toBe(true);
    expect(resolveIsValidStatus({ validateStatus: undefined }, 500)).toBe(true);
  });
});
