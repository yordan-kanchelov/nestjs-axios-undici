import { Test, TestingModule } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { firstValueFrom } from 'rxjs';
import { HttpModule, HttpService } from '../src';

describe('HttpService redirects', () => {
  let server: Server;
  let baseUrl: string;
  let service: HttpService;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/start') {
        res.writeHead(302, { Location: '/middle' });
        res.end();
      } else if (req.url === '/middle') {
        res.writeHead(301, { Location: '/final' });
        res.end();
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: req.url }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({})],
    }).compile();
    service = module.get<HttpService>(HttpService);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('follows redirects when maxRedirections allows it', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}/start`, { maxRedirections: 5 }),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ path: '/final' });
  });

  it('rejects with the last 3xx response when the redirect limit is exceeded', async () => {
    await expect(
      firstValueFrom(
        service.request(`${baseUrl}/start`, { maxRedirections: 1 }),
      ),
    ).rejects.toMatchObject({
      isAxiosError: true,
      response: expect.objectContaining({ status: 301 }),
    });
  });

  it('surfaces the 3xx response as an axios-like error when maxRedirections is 0', async () => {
    await expect(
      firstValueFrom(
        service.request(`${baseUrl}/start`, { maxRedirections: 0 }),
      ),
    ).rejects.toMatchObject({
      isAxiosError: true,
      response: expect.objectContaining({ status: 302 }),
    });
  });

  it('follows redirects configured via axios-style maxRedirects', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({ maxRedirects: 5 })],
    }).compile();
    const axiosStyleService = module.get<HttpService>(HttpService);

    const response = await firstValueFrom(
      axiosStyleService.get(`${baseUrl}/start`),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ path: '/final' });
  });
});
