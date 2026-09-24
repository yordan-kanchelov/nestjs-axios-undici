import { Test, TestingModule } from '@nestjs/testing';
import { lastValueFrom } from 'rxjs';
import { request } from 'undici';
import { HttpModule, HttpService } from '../../src';

jest.mock('undici', () => ({
  ...jest.requireActual('undici'),
  request: jest.fn(),
}));

const requestMock = request as jest.MockedFunction<typeof request>;

describe('HttpService', () => {
  let service: HttpService;
  let baseURL: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({})], // Default is now axios-compatible
    }).compile();

    service = module.get<HttpService>(HttpService);
    baseURL = 'https://example.test/package.json';
  });

  beforeEach(() => {
    const payload = { name: 'undici', version: '7.0.0' };
    requestMock.mockResolvedValue({
      statusCode: 200,
      statusText: 'OK',
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
    } as unknown as Awaited<ReturnType<typeof request>>);
  });

  it('GET', async () => {
    const response = await lastValueFrom(
      service.request(baseURL, {
        method: 'GET',
      }),
    );

    expect(response?.status).toBe(200); // axios-compatible property
    expect(response?.data).toEqual({ name: 'undici', version: '7.0.0' });
    expect(requestMock).toHaveBeenCalledWith(baseURL, {
      method: 'GET',
    });
  });
});
