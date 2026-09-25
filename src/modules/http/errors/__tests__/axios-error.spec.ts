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
      config: {},
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
    const error = new AxiosError('boom', 'ERR_X', { url: '/x', method: 'GET' });
    expect(error.toJSON()).toMatchObject({
      message: 'boom',
      name: 'AxiosError',
      code: 'ERR_X',
      config: { url: '/x' },
    });
  });
});
