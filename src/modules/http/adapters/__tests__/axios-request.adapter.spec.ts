import {
  buildURL,
  combineURLs,
  extractUrlCredentials,
  isAxiosRequestConfig,
  mergeHeaders,
  normalizeAxiosRequest,
  serializeRequestData,
  SIGNAL_CLEANUP,
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
        Accept: 'application/json, text/plain, */*',
        'User-Agent': expect.stringMatching(/^nestjs-axios-undici\/\d/),
        'Accept-Encoding': 'gzip, deflate, br',
        'X-Common': 'c',
        'X-Get': 'g',
        'X-Flat': 'f',
      });
    });

    it('axiosRef.defaults overrides module headers; request headers override both (request > defaults > module)', () => {
      // Precedence, matching axios' own `mergeConfig(this.defaults, config)`:
      // module options only ever *seed* `axiosRef.defaults` at setup (see
      // `createAxiosRefDefaults`); after that, `defaults` is the single
      // source of truth and always wins over the original module-level
      // value - a runtime mutation of `defaults.headers` is not shadowed by
      // the module headers it started out equal to. This replaces the PR
      // #16 rule ("module headers always win over axiosRef.defaults").
      const defaults = createAxiosRefDefaults();
      defaults.headers.common['User-Agent'] = 'from-defaults/1.0';
      const { options: withDefaultsOverride } = normalizeAxiosRequest(
        'http://api/x',
        { method: 'GET' },
        {
          defaults,
          instanceOptions: { headers: { 'User-Agent': 'my-app/1.0' } },
        },
      );
      expect(withDefaultsOverride.headers).toMatchObject({
        'User-Agent': 'from-defaults/1.0',
      });

      const { options: withRequestOverride } = normalizeAxiosRequest(
        'http://api/x',
        { method: 'GET', headers: { 'User-Agent': 'per-request/1.0' } },
        {
          defaults,
          instanceOptions: { headers: { 'User-Agent': 'my-app/1.0' } },
        },
      );
      expect(withRequestOverride.headers).toMatchObject({
        'User-Agent': 'per-request/1.0',
      });
    });

    it('module headers still seed axiosRef.defaults (createAxiosRefDefaults), so they apply when defaults is otherwise untouched', () => {
      // The real pipeline (`HttpService`'s constructor) always seeds
      // `defaults` from module options via `createAxiosRefDefaults`, so by
      // the time a request is normalised, `defaults.headers` already
      // reflects the module value - the separate `instanceOptions.headers`
      // read here is only a defence-in-depth fallback for callers that
      // build `defaults` some other way.
      const defaults = createAxiosRefDefaults({
        headers: { 'User-Agent': 'my-app/1.0' },
      });
      const { options } = normalizeAxiosRequest(
        'http://api/x',
        { method: 'GET' },
        { defaults },
      );
      expect(options.headers).toMatchObject({ 'User-Agent': 'my-app/1.0' });
    });

    it('a request header set to null/undefined removes a default, as in axios', () => {
      const defaults = createAxiosRefDefaults();
      const { options } = normalizeAxiosRequest(
        'http://api/x',
        {
          method: 'GET',
          headers: { Accept: null, 'User-Agent': undefined } as any,
        },
        { defaults },
      );
      expect(options.headers).not.toHaveProperty('Accept');
      expect(options.headers).not.toHaveProperty('User-Agent');
    });

    it('flattens axios-style method keys (common/post/...) in module headers, per method', () => {
      const { options: getOptions } = normalizeAxiosRequest(
        'http://api/x',
        { method: 'GET' },
        {
          instanceOptions: {
            headers: {
              common: { 'X-C': 'c' },
              post: { 'X-P': 'p' },
              'X-Flat': 'f',
            },
          },
        },
      );
      expect(getOptions.headers).toEqual({ 'X-C': 'c', 'X-Flat': 'f' });
      expect(getOptions.headers).not.toHaveProperty('common');
      expect(getOptions.headers).not.toHaveProperty('post');

      const { options: postOptions } = normalizeAxiosRequest(
        'http://api/x',
        { method: 'POST' },
        {
          instanceOptions: {
            headers: {
              common: { 'X-C': 'c' },
              post: { 'X-P': 'p' },
              'X-Flat': 'f',
            },
          },
        },
      );
      expect(postOptions.headers).toEqual({
        'X-C': 'c',
        'X-P': 'p',
        'X-Flat': 'f',
        'Content-Type': 'application/x-www-form-urlencoded',
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

    it('combining a live signal with a cancelToken exposes a cleanup that removes its listener (PR #15 review: no listener leak)', () => {
      const controller = new AbortController();
      let listenerCount = 0;
      const originalAdd = controller.signal.addEventListener.bind(
        controller.signal,
      );
      const originalRemove = controller.signal.removeEventListener.bind(
        controller.signal,
      );
      controller.signal.addEventListener = ((...args: any[]) => {
        listenerCount++;
        return (originalAdd as any)(...args);
      }) as any;
      controller.signal.removeEventListener = ((...args: any[]) => {
        listenerCount--;
        return (originalRemove as any)(...args);
      }) as any;

      const { options } = normalizeAxiosRequest('http://api/x', {
        signal: controller.signal,
        cancelToken: { subscribe: () => undefined },
      });
      expect(listenerCount).toBe(1);
      const cleanup = (options.signal as any)[SIGNAL_CLEANUP];
      expect(typeof cleanup).toBe('function');
      cleanup();
      expect(listenerCount).toBe(0);
      // Cleanup is idempotent (no error) even called twice, and the combined
      // signal is unaffected by removing the underlying listener.
      cleanup();
      expect(options.signal.aborted).toBe(false);
    });

    it('does not expose a cleanup when the caller signal is already aborted (no listener was ever added)', () => {
      const controller = new AbortController();
      controller.abort('bye');
      const { options } = normalizeAxiosRequest('http://api/x', {
        signal: controller.signal,
        cancelToken: { subscribe: () => undefined },
      });
      expect(options.signal.aborted).toBe(true);
      expect((options.signal as any)[SIGNAL_CLEANUP]).toBeUndefined();
    });
  });

  describe('extractUrlCredentials', () => {
    it('extracts and percent-decodes credentials, stripping them from the URL', () => {
      const result = extractUrlCredentials('http://user:pa%20ss@host/path?x=1');
      expect(result).toEqual({
        username: 'user',
        password: 'pa ss',
        url: 'http://host/path?x=1',
      });
    });

    it('returns undefined when there are no credentials', () => {
      expect(extractUrlCredentials('http://host/path')).toBeUndefined();
      expect(extractUrlCredentials('not a url')).toBeUndefined();
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
      // AxiosHeaders now preserves the casing it was set with (plan.md
      // "feat(axiosRef): make it a real axios instance"), so `toJSON()`
      // (which `mergeHeaders` reads through `forEachHeader`) reports 'X-A',
      // not a lower-cased 'x-a'.
      expect(
        mergeHeaders(new AxiosHeaders({ 'X-A': '1' }), ['X-B', '2']),
      ).toEqual({
        'X-A': '1',
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
