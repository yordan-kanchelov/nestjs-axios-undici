import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { request, type Dispatcher } from 'undici';

import { HttpService } from '../index';
import { HttpModule } from '../../../../index';

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  request: jest.fn(),
}));

type ExampleResponse = {
  name: string;
  version?: string;
};

const requestMock = request as jest.MockedFunction<typeof request>;
const dispatcherMock = {} as Dispatcher;

const createResponse = (
  statusCode = 200,
  payload: ExampleResponse = { name: 'undici', version: '7.0.0' },
) =>
  ({
    statusCode,
    statusText: statusCode === 200 ? 'OK' : 'Not Found',
    headers: {
      'content-type': 'application/json',
    },
    body: {
      json: jest.fn().mockResolvedValue(payload),
      text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
    },
    trailers: {},
    opaque: null,
    context: {},
  }) as unknown as Awaited<ReturnType<typeof request>>;

describe('HttpService', () => {
  let service: HttpService;
  let baseURL: string;

  beforeAll(async (): Promise<void> => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({})],
    }).compile();

    service = module.get<HttpService>(HttpService);
    baseURL = 'https://example.test/package.json';
  });

  beforeEach(() => {
    requestMock.mockReset();
    requestMock.mockResolvedValue(createResponse());
  });

  describe('request', () => {
    it('should return an Observable with an axios-like response', async () => {
      await expect(lastValueFrom(service.request(baseURL))).resolves.toEqual(
        expect.objectContaining({
          status: 200,
          statusText: 'OK',
          data: expect.any(Object),
        }),
      );
    });

    it('should call undici request with configured module options', async () => {
      await lastValueFrom(
        service.request(baseURL, {
          method: 'GET',
        }),
      );

      expect(requestMock).toHaveBeenCalledWith(baseURL, {
        method: 'GET',
      });
    });

    it('should reject with an axios-like error on 404 status', async () => {
      requestMock.mockResolvedValueOnce(createResponse(404));

      await expect(
        lastValueFrom(
          service.request(`${baseURL}/missing`, {
            method: 'GET',
          }),
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          status: 404,
        }),
        isAxiosError: true,
      });
    });

    it('should return data with a name', async () => {
      const response = await lastValueFrom(
        service.request<ExampleResponse>(baseURL, {
          method: 'GET',
        }),
      );

      expect(response?.data?.name).toBe('undici');
      expect(response?.data?.version).toBeDefined();
      expect(response?.data?.version).toBeTruthy();
    });

    it('should return data with a version', async () => {
      const response = await lastValueFrom(
        service.request<ExampleResponse>(baseURL, {
          method: 'GET',
        }),
      );

      expect(response?.data?.version).toBeDefined();
      expect(response?.data?.version).toBeTruthy();
      expect(response?.data?.version).not.toBe('');
    });

    it('should emit request errors through the Observable', async () => {
      const error = new Error('network unavailable');
      requestMock.mockRejectedValueOnce(error);

      await expect(
        lastValueFrom(
          service.request(baseURL, {
            method: 'GET',
          }),
        ),
      ).rejects.toThrow(error);
    });

    it('should expose undici options through undiciRef', () => {
      expect(service.undiciRef).toEqual({});
    });

    it('should set a global dispatcher option', () => {
      service.setGlobalDispatcher(dispatcherMock);

      expect(service.undiciRef.dispatcher).toBe(dispatcherMock);
    });

    describe('request with a dispatcher', () => {
      it('should use the dispatcher passed to the request', async () => {
        const configuredService = new HttpService({});

        await lastValueFrom(
          configuredService.request(baseURL, {
            dispatcher: dispatcherMock,
          }),
        );

        expect(requestMock).toHaveBeenCalledWith(baseURL, {
          dispatcher: dispatcherMock,
        });
      });

      it('should merge module options with request options', async () => {
        const configuredService = new HttpService({
          dispatcher: dispatcherMock,
          headers: {
            authorization: 'Bearer module-token',
          },
        });

        await lastValueFrom(
          configuredService.request(baseURL, {
            method: 'POST',
          }),
        );

        expect(requestMock).toHaveBeenCalledWith(baseURL, {
          dispatcher: dispatcherMock,
          headers: {
            authorization: 'Bearer module-token',
          },
          method: 'POST',
        });
      });

      it('should allow request options to override module options', async () => {
        const configuredService = new HttpService({
          method: 'GET',
          headers: {
            authorization: 'Bearer module-token',
          },
        });

        await lastValueFrom(
          configuredService.request(baseURL, {
            method: 'PUT',
          }),
        );

        expect(requestMock).toHaveBeenCalledWith(baseURL, {
          headers: {
            authorization: 'Bearer module-token',
          },
          method: 'PUT',
        });
      });
    });
  });
});
