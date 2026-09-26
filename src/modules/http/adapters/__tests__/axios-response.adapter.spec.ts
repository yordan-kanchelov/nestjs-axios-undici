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
    const undiciResponse: any = {
      statusCode: 200,
      statusText: 'OK',
      headers: { 'content-encoding': 'gzip' },
      body: Readable.from([compressed]),
    };
    const response = await toAxiosLikeResponse(
      fakeRequest({ maxContentLength: 200 }),
      undiciResponse,
    );
    const error: any = await readAll(response.data).catch(e => e);
    expect(error?.code).toBe('ERR_BAD_RESPONSE');
    expect(error?.message).toBe('maxContentLength size of 200 exceeded');
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
