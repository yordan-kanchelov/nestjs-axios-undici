/**
 * Covers plan.md phase 2 "fix(config): transport options" - HTTP/2 opt-in:
 * axios' `httpVersion: 2` maps to `Agent({ allowH2: true })` at module
 * level. Tested against a real `http2.createSecureServer({ allowHTTP1: true
 * })` with the same fixture certificate as transport-tls.e2e.spec.ts (ALPN
 * needs a real TLS handshake - undici has no HTTP/2 support over plaintext).
 */
import { createSecureServer, Http2SecureServer } from 'node:http2';
import { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Agent as HttpsAgent } from 'node:https';
import { Test, TestingModule } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { HttpModule, HttpService } from '../src';

const FIXTURES = join(__dirname, 'fixtures', 'tls');
const cert = readFileSync(join(FIXTURES, 'server-cert.pem'));
const key = readFileSync(join(FIXTURES, 'server-key.pem'));

describe('HttpService httpVersion: 2 (HTTP/2 opt-in)', () => {
  let server: Http2SecureServer;
  let baseUrl: string;
  const modules: TestingModule[] = [];

  beforeAll(async () => {
    server = createSecureServer({ cert, key, allowHTTP1: true });
    // With `allowHTTP1: true`, Node's http2 compatibility layer emits
    // 'request' for both HTTP/2 and HTTP/1.1 clients (not 'stream', which
    // would double-respond alongside it) - `req.httpVersion` tells them
    // apart.
    server.on('request', (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ httpVersion: req.httpVersion }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await Promise.all(modules.map(m => m.close()));
    await new Promise(resolve => server.close(resolve));
  });

  const makeService = async (options: any): Promise<HttpService> => {
    const module = await Test.createTestingModule({
      imports: [HttpModule.register(options)],
    }).compile();
    modules.push(module);
    return module.get(HttpService);
  };

  it('httpVersion: 2 negotiates HTTP/2 (ALPN h2)', async () => {
    const service = await makeService({
      httpVersion: 2,
      httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
    });
    const response = await firstValueFrom(service.get(baseUrl));
    expect(response.status).toBe(200);
    expect(response.data.httpVersion).toBe('2.0');
  });

  it('without httpVersion: 2, the same server falls back to HTTP/1.1', async () => {
    const service = await makeService({
      httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
    });
    const response = await firstValueFrom(service.get(baseUrl));
    expect(response.status).toBe(200);
    expect(response.data.httpVersion).toBe('1.1');
  });
});
