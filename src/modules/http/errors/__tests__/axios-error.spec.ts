import {
  AxiosError,
  CanceledError,
  createStatusError,
  createTimeoutError,
  createUnsupportedProtocolError,
  isAxiosError,
  isCancel,
  isDeadlineTimeoutReason,
  toAxiosError,
  type DeadlineTimeoutReason,
} from '../axios-error';
import { AxiosHeaders } from '../../interfaces/axios-headers';

const request = {
  url: 'http://api/x',
  options: { method: 'GET', headersTimeout: 250 },
};

const undiciError = (code: string, message = code) =>
  Object.assign(new Error(message), { code });

describe('axios errors', () => {
  it('maps status codes to ERR_BAD_REQUEST / ERR_BAD_RESPONSE', () => {
    const response = {
      data: '',
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: new AxiosHeaders() },
    };
    const error = createStatusError(response);
    expect(error).toBeInstanceOf(AxiosError);
    expect(error).toMatchObject({
      message: 'Request failed with status code 404',
      code: 'ERR_BAD_REQUEST',
      status: 404,
      isAxiosError: true,
    });
    expect(createStatusError({ ...response, status: 502 }).code).toBe(
      'ERR_BAD_RESPONSE',
    );
  });

  it.each([
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_CONNECT_TIMEOUT',
  ])('maps %s to ECONNABORTED with the axios timeout message', code => {
    const error = toAxiosError(undiciError(code), request);
    expect(error).toMatchObject({
      code: 'ECONNABORTED',
      message: 'timeout of 250ms exceeded',
      name: 'AxiosError',
    });
    expect(error.config.url).toBe('http://api/x');
    expect(error.cause.code).toBe(code);
  });

  it('maps aborts to CanceledError', () => {
    const abort = Object.assign(new Error('This operation was aborted'), {
      name: 'AbortError',
    });
    const error = toAxiosError(abort, request);
    expect(error).toBeInstanceOf(CanceledError);
    expect(error).toMatchObject({ code: 'ERR_CANCELED', message: 'canceled' });
    expect(isCancel(error)).toBe(true);

    const withReason = toAxiosError(new CanceledError('stop'), request);
    expect(withReason.message).toBe('stop');
  });

  it('keeps network error codes and maps undici socket errors to ECONNRESET', () => {
    expect(toAxiosError(undiciError('ECONNREFUSED'), request).code).toBe(
      'ECONNREFUSED',
    );
    expect(
      toAxiosError(undiciError('UND_ERR_SOCKET', 'other side closed'), request),
    ).toMatchObject({
      code: 'ECONNRESET',
      message: 'other side closed',
      isAxiosError: true,
    });
  });

  it('passes axios errors and code-less errors through unchanged', () => {
    const axiosError = new AxiosError('boom', 'ERR_X');
    expect(toAxiosError(axiosError, request)).toBe(axiosError);
    const plain = new Error('from an interceptor');
    expect(toAxiosError(plain, request)).toBe(plain);
    expect(isAxiosError(plain)).toBe(false);
  });

  it('toJSON returns a serialisable snapshot', () => {
    const error = new AxiosError('boom', 'ERR_X', {
      url: '/x',
      method: 'GET',
      headers: new AxiosHeaders(),
    });
    expect(error.toJSON()).toMatchObject({
      message: 'boom',
      name: 'AxiosError',
      code: 'ERR_X',
      config: { url: '/x' },
    });
  });

  it("toJSON matches axios' key set exactly, and serialises AxiosHeaders as a plain object", () => {
    const headers = new AxiosHeaders({ 'X-A': '1' });
    const error = new AxiosError('boom', 'ERR_X', { url: '/x', headers });
    const json = error.toJSON();
    expect(Object.keys(json).sort()).toEqual(
      [
        'message',
        'name',
        'description',
        'number',
        'fileName',
        'lineNumber',
        'columnNumber',
        'stack',
        'config',
        'code',
        'status',
      ].sort(),
    );
    expect(json.description).toBeUndefined();
    expect((json.config as any).headers).toEqual({ 'X-A': '1' });
    expect((json.config as any).headers).not.toBeInstanceOf(AxiosHeaders);
  });

  it('createUnsupportedProtocolError matches axios: ERR_BAD_REQUEST, config set, no request', () => {
    const error = createUnsupportedProtocolError('tel:', request);
    expect(error).toMatchObject({
      message: 'Unsupported protocol tel:',
      code: 'ERR_BAD_REQUEST',
      name: 'AxiosError',
      isAxiosError: true,
    });
    expect(error.request).toBeUndefined();
    expect(error.config?.url).toBe('http://api/x');
  });

  it('createTimeoutError uses timeoutErrorMessage/clarifyTimeoutError when set', () => {
    const reason: DeadlineTimeoutReason = {
      axiosDeadlineTimeout: true,
      timeout: 500,
    };
    expect(isDeadlineTimeoutReason(reason)).toBe(true);
    expect(isDeadlineTimeoutReason(undefined)).toBe(false);
    expect(isDeadlineTimeoutReason(new Error('x'))).toBe(false);

    const plain = createTimeoutError(reason, request, { path: '/x' });
    expect(plain).toMatchObject({
      message: 'timeout of 500ms exceeded',
      code: 'ECONNABORTED',
    });
    expect(plain.request).toEqual({ path: '/x' });

    const clarified = createTimeoutError(
      { ...reason, clarifyTimeoutError: true },
      request,
    );
    expect(clarified.code).toBe('ETIMEDOUT');

    const custom = createTimeoutError(
      { ...reason, timeoutErrorMessage: 'custom!' },
      request,
    );
    expect(custom.message).toBe('custom!');
  });

  it('toAxiosError prefers the per-request signal over the pre-merge options.signal (PR #15 review)', () => {
    // The caller's own (pre-merge) signal never fires; the *effective*
    // per-request signal (what undici was actually given) is what aborted.
    const staleUserSignal = new AbortController().signal;
    const effectiveController = new AbortController();
    const reason = new Error('This operation was aborted');
    effectiveController.abort(reason);

    const reqWithStaleSignal = {
      ...request,
      options: { ...request.options, signal: staleUserSignal },
    };
    const error = toAxiosError(
      reason,
      reqWithStaleSignal,
      effectiveController.signal,
    );
    expect(error).toBeInstanceOf(CanceledError);
    expect(isCancel(error)).toBe(true);
  });

  it('toAxiosError sets error.request from the given requestInfo', () => {
    const error = toAxiosError(
      undiciError('ECONNREFUSED'),
      request,
      undefined,
      {
        path: '/x',
        host: 'api',
      },
    );
    expect(error.request).toEqual({ path: '/x', host: 'api' });
  });

  it('maps undici argument-validation failures to ERR_BAD_REQUEST', () => {
    const error = toAxiosError(
      undiciError('UND_ERR_INVALID_ARG', 'invalid X-Bad header'),
      request,
    );
    expect(error).toMatchObject({
      code: 'ERR_BAD_REQUEST',
      isAxiosError: true,
    });
  });
});

// plan.md phase 2 "types: axios interop": optional `axios` peer, linked
// lazily at module load (`linkOptionalAxiosPeer` in ../axios-error.ts).
describe('optional axios peer', () => {
  it('makes our errors instanceof axios.AxiosError when axios is installed', () => {
    // `axios` is a devDependency here, so it's installed and
    // `linkOptionalAxiosPeer` (run once when ../axios-error.ts first loaded)
    // already re-pointed AxiosError's prototype onto axios' own.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the same lazy load the module itself does
    const axios = require('axios');

    const error = new AxiosError('boom', 'ERR_X');
    expect(error).toBeInstanceOf(axios.AxiosError);

    // CanceledError extends AxiosError, so it's instanceof axios.AxiosError
    // too, transitively - see the doc comment on linkOptionalAxiosPeer for
    // why instanceof axios.CanceledError specifically does NOT hold.
    const canceled = new CanceledError('stopped');
    expect(canceled).toBeInstanceOf(axios.AxiosError);
    // Our own errors, and isAxiosError()/isCancel() (duck-typed, not
    // instanceof), still work exactly as before either way.
    expect(canceled).toBeInstanceOf(CanceledError);
    expect(canceled).toBeInstanceOf(AxiosError);
    expect(isAxiosError(canceled)).toBe(true);
    expect(isCancel(canceled)).toBe(true);
  });

  it('loads fine, with our own AxiosError/CanceledError unaffected, when axios is not installed', () => {
    try {
      jest.isolateModules(() => {
        jest.doMock('axios', () => {
          throw new Error("Cannot find module 'axios'");
        });
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module graph with axios' require mocked to fail
        const isolated = require('../axios-error');
        const error = new isolated.AxiosError('boom', 'ERR_X');
        expect(error).toBeInstanceOf(isolated.AxiosError);
        expect(isolated.isAxiosError(error)).toBe(true);
        const canceled = new isolated.CanceledError();
        expect(canceled).toBeInstanceOf(isolated.CanceledError);
        expect(canceled).toBeInstanceOf(isolated.AxiosError);
        expect(isolated.isCancel(canceled)).toBe(true);
      });
    } finally {
      // See tests/transport-cookie-jar.e2e.spec.ts for why this is needed:
      // `jest.doMock` registers into the shared mock registry, which
      // `isolateModules` doesn't undo on its own.
      jest.dontMock('axios');
    }
  });
});
