import { Agent as HttpsAgent, createServer as createHttpsServer } from 'node:https';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { closeModules, outcome, pair } from './harness';

import { execSync } from 'node:child_process';
// self-signed test cert generated on the fly (not committed)
const certDir = join(tmpdir(), 'diff-tls');
execSync(`mkdir -p ${certDir} && [ -f ${certDir}/cert.pem ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout ${certDir}/key.pem -out ${certDir}/cert.pem -days 2 -subj /CN=localhost 2>/dev/null`);
const key = readFileSync(join(certDir, 'key.pem'));
const cert = readFileSync(join(certDir, 'cert.pem'));

describe('diff: TLS agent options and socketPath', () => {
  afterAll(closeModules);

  it.each([
    ['rejectUnauthorized: false', { rejectUnauthorized: false }],
    ['custom ca', { ca: cert }],
    ['keepAlive + ca', { keepAlive: true, ca: cert }],
  ])('httpsAgent %s reaches a self-signed server', async (...[, agentOpts]: any[]) => {
    const srv = createHttpsServer({ key, cert }, (_req, res) => res.end('secure'));
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    const url = `https://localhost:${(srv.address() as any).port}/`;
    const p = await pair({ httpsAgent: new HttpsAgent(agentOpts) });
    const a = await outcome(p.a.get(url));
    const u = await outcome(p.u.get(url));
    srv.close();
    expect(u).toEqual(a);
  });

  it('socketPath (unix socket)', async () => {
    const sock = join(tmpdir(), `diff-${process.pid}.sock`);
    rmSync(sock, { force: true });
    const srv = createServer((req, res) => res.end('via-socket:' + req.url));
    await new Promise<void>(r => srv.listen(sock, r));
    const p = await pair({ socketPath: sock });
    const a = await outcome(p.a.get('http://localhost/path?x=1'));
    const u = await outcome(p.u.get('http://localhost/path?x=1'));
    srv.close();
    expect(u).toEqual(a);
  });

  it('socketPath per request', async () => {
    const sock = join(tmpdir(), `diff2-${process.pid}.sock`);
    rmSync(sock, { force: true });
    const srv = createServer((req, res) => res.end('via-socket:' + req.url));
    await new Promise<void>(r => srv.listen(sock, r));
    const p = await pair();
    const a = await outcome(p.a.get('http://localhost/p', { socketPath: sock }));
    const u = await outcome(p.u.get('http://localhost/p', { socketPath: sock } as any));
    srv.close();
    expect(u).toEqual(a);
  });
});
