import { Readable } from 'node:stream';
import { RequestInfo, toAxiosLikeResponse } from '../axios-response.adapter';
import type { HttpInterceptorRequest } from '../../interfaces/http-interceptor.interface';

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
