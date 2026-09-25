import {
  buildURL,
  combineURLs,
  isAxiosRequestConfig,
  mergeHeaders,
  normalizeAxiosRequest,
  serializeRequestData,
  toUrlEncodedForm,
} from '../axios-request.adapter';
import { createAxiosRefDefaults } from '../axios-ref.factory';
import { AxiosHeaders } from '../../interfaces/axios-headers';

describe('axios request adapter', () => {
  describe('normalizeAxiosRequest', () => {
    it('returns the options untouched when there is nothing axios-specific to do', () => {
      const options = { method: 'GET', headersTimeout: 5 };
      const result = normalizeAxiosRequest('http://api/x', options);
      expect(result.url).toBe('http://api/x');
      expect(result.options).toBe(options);
    });

    it('accepts the request(config) form and upper-cases the method', () => {
      const { url, options } = normalizeAxiosRequest(
        {
          url: 'http://api/x',
          method: 'post',
          data: { a: 1 },
          params: { q: 1 },
        },
        undefined,
      );
      expect(url).toBe('http://api/x?q=1');
      expect(options).toMatchObject({
        method: 'POST',
        body: '{"a":1}',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(options).not.toHaveProperty('data');
      expect(options).not.toHaveProperty('params');
      expect(options).not.toHaveProperty('url');
    });

    it('does not treat URL instances as a config object', () => {
      expect(isAxiosRequestConfig(new URL('http://api/x'))).toBe(false);
      expect(isAxiosRequestConfig({ url: 'http://api/x' })).toBe(true);
      expect(isAxiosRequestConfig({ protocol: 'http:', host: 'api' })).toBe(
        false,
      );
    });

    it('merges module headers, axiosRef defaults and request headers case-insensitively', () => {
      const defaults = createAxiosRefDefaults();
      defaults.headers.common['X-Common'] = 'c';
      defaults.headers.get['X-Get'] = 'g';
      defaults.headers['X-Flat'] = 'f';
      const { options } = normalizeAxiosRequest(
        'http://api/x',
        {
          method: 'GET',
          headers: { 'x-module': 'overridden', 'X-Remove': null } as any,
        },
        {
          defaults,
          instanceOptions: { headers: { 'X-Module': 'm', 'X-Remove': 'r' } },
        },
      );
      expect(options.headers).toEqual({
        'x-module': 'overridden',
        'X-Common': 'c',
        'X-Get': 'g',
        'X-Flat': 'f',
      });
    });

    it('applies module baseURL/auth/params/timeout/maxRedirects from raw options', () => {
      const { url, options } = normalizeAxiosRequest(
        '/users',
        { params: { page: 2 }, headers: { Authorization: 'Bearer x' } },
        {
          instanceOptions: {
            baseURL: 'http://api/v1',
            auth: { username: 'u', password: 'p' },
            params: { key: 'k' },
            timeout: 1000,
            maxRedirects: 3,
          },
        },
      );
      expect(url).toBe('http://api/v1/users?key=k&page=2');
      expect(options.headers).toEqual({ Authorization: 'Basic dTpw' });
      expect(options.timeout).toBe(1000);
      expect(options.maxRedirections).toBe(3);
    });

    it('maps an already-cancelled CancelToken to an aborted signal', () => {
      const reason = { message: 'stop', __CANCEL__: true };
      const { options } = normalizeAxiosRequest('http://api/x', {
        cancelToken: { reason },
      });
      expect(options.signal.aborted).toBe(true);
      expect(options.signal.reason).toBe(reason);
    });
  });

  describe('URL helpers', () => {
    it('combineURLs concatenates like axios', () => {
      expect(combineURLs('http://api/v1/', '/users')).toBe(
        'http://api/v1/users',
      );
      expect(combineURLs('http://api/v1', '')).toBe('http://api/v1');
    });

    it('buildURL strips the hash and appends to an existing query', () => {
      expect(buildURL('/a?x=1#frag', { y: 2 })).toBe('/a?x=1&y=2');
      expect(buildURL('/a', {})).toBe('/a');
      expect(buildURL('/a', { k: 'v' }, { serialize: () => 'custom' })).toBe(
        '/a?custom',
      );
    });
  });

  describe('body helpers', () => {
    it('serializes JSON, URLSearchParams and binary data', () => {
      const headers: Record<string, any> = {};
      expect(serializeRequestData({ a: 1 }, headers, 'POST')).toBe('{"a":1}');
      expect(headers).toEqual({ 'Content-Type': 'application/json' });

      const formHeaders: Record<string, any> = {};
      expect(
        serializeRequestData(
          new URLSearchParams({ a: '1' }),
          formHeaders,
          'PUT',
        ),
      ).toBe('a=1');
      expect(formHeaders['Content-Type']).toBe(
        'application/x-www-form-urlencoded;charset=utf-8',
      );

      expect(serializeRequestData(new Uint8Array([1, 2]), {}, 'POST')).toEqual(
        Buffer.from([1, 2]),
      );
      expect(serializeRequestData(0, {}, 'POST')).toBeUndefined();
    });

    it('encodes global FormData as a multipart stream with a boundary', () => {
      const form = new FormData();
      form.append('k', 'v');
      const headers: Record<string, any> = {};
      const body = serializeRequestData(form, headers, 'POST');
      expect(typeof body.pipe).toBe('function');
      expect(headers['Content-Type']).toMatch(
        /^multipart\/form-data; boundary=/,
      );
    });

    it('mergeHeaders reads AxiosHeaders and raw undici header arrays', () => {
      expect(
        mergeHeaders(new AxiosHeaders({ 'X-A': '1' }), ['X-B', '2']),
      ).toEqual({
        'x-a': '1',
        'X-B': '2',
      });
    });

    it('toUrlEncodedForm supports nested values', () => {
      expect(
        toUrlEncodedForm({ a: 1, b: 'x y', list: [1, 2], obj: { k: 'v' } }),
      ).toBe('a=1&b=x%20y&list%5B%5D=1&list%5B%5D=2&obj%5Bk%5D=v');
    });
  });
});
