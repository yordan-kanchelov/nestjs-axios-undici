import {
  AxiosError,
  CanceledError,
  createStatusError,
  isAxiosError,
  isCancel,
  toAxiosError,
} from '../axios-error';

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
      config: { headers: {} },
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
      headers: {},
    });
    expect(error.toJSON()).toMatchObject({
      message: 'boom',
      name: 'AxiosError',
      code: 'ERR_X',
      config: { url: '/x' },
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
