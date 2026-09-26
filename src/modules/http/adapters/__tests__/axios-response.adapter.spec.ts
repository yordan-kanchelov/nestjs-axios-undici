import { RequestInfo } from '../axios-response.adapter';

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
