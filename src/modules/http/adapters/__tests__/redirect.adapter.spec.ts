import {
  buildRedirectHop,
  normalizeSensitiveHeaders,
} from '../redirect.adapter';

describe('normalizeSensitiveHeaders', () => {
  it('undefined/null both mean "no extra headers"', () => {
    expect(normalizeSensitiveHeaders(undefined)).toEqual(new Set());
    expect(normalizeSensitiveHeaders(null)).toEqual(new Set());
  });

  it('lower-cases and dedupes an array of strings', () => {
    expect(
      normalizeSensitiveHeaders(['X-Api-Key', 'x-api-key', 'X-Secret']),
    ).toEqual(new Set(['x-api-key', 'x-secret']));
  });

  it('an empty array normalises to an empty Set', () => {
    expect(normalizeSensitiveHeaders([])).toEqual(new Set());
  });

  it("rejects a non-array value with axios' exact message", () => {
    expect(() => normalizeSensitiveHeaders('X-Api-Key')).toThrow(
      'sensitiveHeaders must be an array of strings',
    );
    expect(() => normalizeSensitiveHeaders(123)).toThrow(
      'sensitiveHeaders must be an array of strings',
    );
  });

  it('rejects an array containing a non-string element', () => {
    expect(() => normalizeSensitiveHeaders(['X-Api-Key', 42])).toThrow(
      'sensitiveHeaders must be an array of strings',
    );
  });
});

describe('buildRedirectHop: sensitiveHeaders', () => {
  const baseInput = {
    location: '',
    statusCode: 302,
    method: 'GET',
    body: undefined,
    responseHeaders: {},
  };

  it('strips a custom header on a cross-host redirect, alongside Authorization', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'https://a.example/start',
      location: 'https://b.example/next',
      headers: {
        Authorization: 'Bearer t',
        'X-Api-Key': 'secret',
        Accept: '*/*',
      },
      sensitiveHeaders: new Set(['x-api-key']),
    });

    expect(hop.headers.Authorization).toBeUndefined();
    expect(hop.headers['X-Api-Key']).toBeUndefined();
    expect(hop.headers.Accept).toBe('*/*');
  });

  it('strips a custom header on a same-host, http->https UPGRADE - unlike Authorization/Cookie, which stay (subdomain/upgrade-exempt)', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'http://example.com/start',
      location: 'https://example.com/next',
      headers: { Authorization: 'Bearer t', 'X-Api-Key': 'secret' },
      sensitiveHeaders: new Set(['x-api-key']),
    });

    // Same host, and upgrading to https - the built-in, lenient rule leaves
    // Authorization alone (`shouldStripSensitiveHeaders` is false: protocol
    // changed, but the new one IS https, and host didn't change).
    expect(hop.headers.Authorization).toBe('Bearer t');
    // The custom header uses the stricter, origin-based rule instead: any
    // origin change (this one included) strips it regardless.
    expect(hop.headers['X-Api-Key']).toBeUndefined();
  });

  it('strips a custom header on a subdomain redirect - unlike Authorization/Cookie, which stay (subdomain-exempt)', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'https://example.com/start',
      location: 'https://api.example.com/next',
      headers: { Authorization: 'Bearer t', 'X-Api-Key': 'secret' },
      sensitiveHeaders: new Set(['x-api-key']),
    });

    expect(hop.headers.Authorization).toBe('Bearer t');
    expect(hop.headers['X-Api-Key']).toBeUndefined();
  });

  it('keeps a custom header on a genuine same-origin redirect (same protocol, host and port)', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'https://example.com/start',
      location: 'https://example.com/next',
      headers: { Authorization: 'Bearer t', 'X-Api-Key': 'secret' },
      sensitiveHeaders: new Set(['x-api-key']),
    });

    expect(hop.headers.Authorization).toBe('Bearer t');
    expect(hop.headers['X-Api-Key']).toBe('secret');
  });

  it('with no sensitiveHeaders configured, behaves exactly as before (only the built-in 3, lenient rule)', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'https://example.com/start',
      location: 'https://api.example.com/next',
      headers: { Authorization: 'Bearer t', 'X-Api-Key': 'secret' },
    });

    expect(hop.headers.Authorization).toBe('Bearer t');
    expect(hop.headers['X-Api-Key']).toBe('secret');
  });

  it('an empty sensitiveHeaders Set behaves exactly as before too', () => {
    const hop = buildRedirectHop({
      ...baseInput,
      currentUrl: 'https://example.com/start',
      location: 'http://example.com/next',
      headers: { Authorization: 'Bearer t', 'X-Api-Key': 'secret' },
      sensitiveHeaders: new Set(),
    });

    // Downgrade to http: the built-in, lenient rule still strips
    // Authorization on its own.
    expect(hop.headers.Authorization).toBeUndefined();
    expect(hop.headers['X-Api-Key']).toBe('secret');
  });
});
