import { Test, TestingModule } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { firstValueFrom } from 'rxjs';
import {
  Agent,
  Dispatcher,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from 'undici';
import { HttpModule, HttpService } from '../src';

describe('HttpService redirects', () => {
  let server: Server;
  let baseUrl: string;
  let otherServer: Server;
  let otherUrl: string;
  let service: HttpService;
  let loopHits: number;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        if (req.url === '/start') {
          res.writeHead(302, { Location: '/middle' });
          res.end();
        } else if (req.url === '/middle') {
          res.writeHead(301, { Location: '/final' });
          res.end();
        } else if (req.url === '/post-redirect') {
          res.writeHead(301, { Location: '/echo' });
          res.end();
        } else if (req.url === '/loop') {
          loopHits++;
          res.writeHead(302, { Location: '/loop' });
          res.end();
        } else if (req.url === '/before-redirect') {
          res.writeHead(302, { Location: '/final' });
          res.end();
        } else if (req.url === '/cross-host') {
          res.writeHead(302, { Location: `${otherUrl}/final` });
          res.end();
        } else if (req.url === '/echo') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ method: req.method, body, headers: req.headers }),
          );
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ path: req.url }));
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    otherServer = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, headers: req.headers }));
    });
    await new Promise<void>(resolve =>
      otherServer.listen(0, '127.0.0.1', resolve),
    );
    otherUrl = `http://127.0.0.1:${(otherServer.address() as AddressInfo).port}`;

    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule.register({})],
    }).compile();
    service = module.get<HttpService>(HttpService);
  });

  beforeEach(() => {
    loopHits = 0;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await new Promise<void>(resolve => otherServer.close(() => resolve()));
  });

  it('follows redirects by default with no maxRedirects/maxRedirections set anywhere', async () => {
    const response = await firstValueFrom(service.request(`${baseUrl}/start`));

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ path: '/final' });
  });

  it('follows redirects when maxRedirections allows it', async () => {
    const response = await firstValueFrom(
      service.request(`${baseUrl}/start`, { maxRedirections: 5 }),
    );

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ path: '/final' });
  });

  it('rejects with ERR_FR_TOO_MANY_REDIRECTS when the redirect limit is exceeded', async () => {
    // Individual assertions rather than `toMatchObject`: `message` is a
    // non-enumerable own property (standard `Error` behaviour), which trips
    // up `toMatchObject`'s subset check.
    let error: any;
    try {
      await firstValueFrom(
        service.request(`${baseUrl}/start`, { maxRedirections: 1 }),
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.isAxiosError).toBe(true);
    expect(error.code).toBe('ERR_FR_TOO_MANY_REDIRECTS');
    expect(error.message).toBe('Maximum number of redirects exceeded');
    // Like axios: this is a request-level error, not a response error.
    expect(error.response).toBeUndefined();
  });

  it('follows exactly 21 redirects by default before rejecting (22nd exceeds the limit)', async () => {
    await expect(
      firstValueFrom(service.request(`${baseUrl}/loop`)),
    ).rejects.toMatchObject({ code: 'ERR_FR_TOO_MANY_REDIRECTS' });
    expect(loopHits).toBe(22);
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

  it('sets response.request.res.responseUrl to the final hop once a redirect was followed', async () => {
    const response: any = await firstValueFrom(
      service.request(`${baseUrl}/start`),
    );

    expect(response.request.res.responseUrl).toBe(`${baseUrl}/final`);
  });

  it('turns POST into GET and drops the body/Content-* headers on 301/302', async () => {
    const response: any = await firstValueFrom(
      service.post(`${baseUrl}/post-redirect`, { a: 1 }),
    );

    expect(response.data.method).toBe('GET');
    expect(response.data.body).toBe('');
    expect(response.data.headers['content-type']).toBeUndefined();
  });

  it('runs beforeRedirect (request-level) before each hop', async () => {
    const seen: Array<{ statusCode: number; hostname: string }> = [];
    const response = await firstValueFrom(
      service.request(`${baseUrl}/before-redirect`, {
        beforeRedirect: (options: any, responseDetails: any) => {
          seen.push({
            statusCode: responseDetails.statusCode,
            hostname: options.hostname,
          });
          options.headers = { ...options.headers, 'X-Before': '1' };
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([{ statusCode: 302, hostname: '127.0.0.1' }]);
  });

  it('runs beforeRedirect (module-level) before each hop', async () => {
    const seen: number[] = [];
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        HttpModule.register({
          beforeRedirect: (_options: any, responseDetails: any) => {
            seen.push(responseDetails.statusCode);
          },
        }),
      ],
    }).compile();
    const withModuleHook = module.get<HttpService>(HttpService);

    await firstValueFrom(withModuleHook.request(`${baseUrl}/before-redirect`));

    expect(seen).toEqual([302]);
  });

  it('drops Authorization across a cross-host redirect', async () => {
    const response: any = await firstValueFrom(
      service.request(`${baseUrl}/cross-host`, {
        headers: { Authorization: 'Bearer secret' },
      }),
    );

    expect(response.data.headers.authorization).toBeUndefined();
  });

  it('keeps Authorization on a same-host, same-port redirect', async () => {
    const response: any = await firstValueFrom(
      service.request(`${baseUrl}/start`, {
        headers: { Authorization: 'Bearer secret' },
      }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects clearly when a streamed body would need to be resent (307)', async () => {
    const server307 = createServer((req, res) => {
      if (req.url === '/redirect-307') {
        res.writeHead(307, { Location: '/final' });
        return res.end();
      }
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>(resolve =>
      server307.listen(0, '127.0.0.1', resolve),
    );
    const port = (server307.address() as AddressInfo).port;

    try {
      await expect(
        firstValueFrom(
          service.post(
            `http://127.0.0.1:${port}/redirect-307`,
            Readable.from(['chunk']),
          ),
        ),
      ).rejects.toMatchObject({ code: 'ERR_FR_REDIRECTION_FAILURE' });
    } finally {
      await new Promise<void>(resolve => server307.close(() => resolve()));
    }
  });

  it('follows redirects when the global dispatcher comes from another copy of undici', async () => {
    // Node.js 22 bundles undici 6. When anything reads the global `fetch` before
    // this package loads undici, that copy becomes the global dispatcher, and
    // interceptors from undici 7 can't be composed onto it. Manual redirect
    // handling never calls `.compose()`, so this is no longer a special case -
    // this test guards against regressing back to it.
    const agent = new Agent();
    const foreignDispatcher = {
      dispatch: (
        opts: Dispatcher.DispatchOptions,
        handler: Dispatcher.DispatchHandler,
      ) => agent.dispatch(opts, handler),
      compose: jest.fn(() => {
        throw new Error(
          'interceptors from another undici copy are not supported',
        );
      }),
      close: () => agent.close(),
      destroy: () => agent.destroy(),
    };
    const previous = getGlobalDispatcher();
    setGlobalDispatcher(foreignDispatcher as unknown as Dispatcher);

    try {
      const response = await firstValueFrom(
        service.request(`${baseUrl}/start`, { maxRedirections: 5 }),
      );

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ path: '/final' });
      expect(foreignDispatcher.compose).not.toHaveBeenCalled();
    } finally {
      setGlobalDispatcher(previous);
      await agent.close();
    }
  });
});
