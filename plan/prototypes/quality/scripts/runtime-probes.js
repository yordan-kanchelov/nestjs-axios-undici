// Runtime probes for nestjs-axios-undici edge cases. Run from a project that has the
// package + @nestjs/{common,core} + rxjs + undici installed: node runtime-probes.js
require('reflect-metadata');
const http = require('node:http');
const { Test } = require('@nestjs/testing');
const { firstValueFrom } = require('rxjs');
const { HttpModule, HttpService } = require('nestjs-axios-undici');

const seen = [];
let openConns = 0;
const server = http.createServer((req, res) => {
  seen.push({ url: req.url, headers: req.headers });
  if (req.url.startsWith('/slow')) {
    req.on('close', () => seen.push({ aborted: req.url }));
    return setTimeout(() => { if (!res.destroyed) res.end('late'); }, 1500);
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, url: req.url }));
});
server.on('connection', s => { openConns++; s.on('close', () => openConns--); });

async function svc(opts) {
  const mod = await Test.createTestingModule({ imports: [HttpModule.register(opts)] }).compile();
  return { mod, http: mod.get(HttpService) };
}
const probe = async (name, fn) => {
  try { console.log(`[${name}]`, await fn()); } catch (e) { console.log(`[${name}] THREW`, e.code || '', e.message); }
};

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  await probe('baseURL + UrlObject', async () => {
    const { http: h, mod } = await svc({ baseURL: base });
    const r = await firstValueFrom(h.get({ protocol: 'http:', hostname: '127.0.0.1', port: server.address().port, pathname: '/obj' }));
    await mod.close(); return r.data.url;
  });

  await probe('socketPath option', async () => {
    const { http: h, mod } = await svc({ socketPath: '/tmp/nonexistent.sock' });
    const r = await firstValueFrom(h.get(`${base}/sock`)); await mod.close(); return r.status;
  });

  await probe('unknown/raw axios keys forwarded to undici', async () => {
    const undici = require('undici');
    const agent = new undici.Agent();
    const orig = agent.dispatch.bind(agent);
    let keys;
    agent.dispatch = (opts, handler) => { keys = Object.keys(opts).sort(); return orig(opts, handler); };
    const { http: h, mod } = await svc({ baseURL: base, proxy: undefined, auth: { username: 'u', password: 'p' }, dispatcher: agent, timeout: 1000 });
    await firstValueFrom(h.get('/keys')); await mod.close(); await agent.close(); return keys.join(',');
  });

  await probe('unsubscribe aborts in-flight request?', async () => {
    const { http: h, mod } = await svc({});
    const sub = h.get(`${base}/slow1`).subscribe({ error: () => {} });
    await new Promise(r => setTimeout(r, 100)); sub.unsubscribe();
    await new Promise(r => setTimeout(r, 300));
    await mod.close();
    return seen.some(s => s.aborted === '/slow1') ? 'aborted (good)' : 'NOT aborted: request keeps running after unsubscribe';
  });

  await probe('dispatchers created by module closed on app close?', async () => {
    const before = openConns;
    const { http: h, mod } = await svc({ withCredentials: true, httpAgent: new http.Agent({ keepAlive: true, maxSockets: 4 }) });
    await firstValueFrom(h.get(`${base}/cookie`));
    await mod.close();
    await new Promise(r => setTimeout(r, 200));
    return `server-side open connections after module.close(): ${openConns - before} (0 = closed)`;
  });

  await probe('interceptorCount on fresh service', async () => {
    const { http: h, mod } = await svc({}); const c = h.interceptorCount; await mod.close(); return c;
  });

  await probe('config.headers type at runtime in response', async () => {
    const { http: h, mod } = await svc({ headers: { 'x-a': '1' } });
    const r = await firstValueFrom(h.get(`${base}/h`)); await mod.close();
    return `${r.config.headers?.constructor?.name}; has .set: ${typeof r.config.headers?.set}`;
  });

  await probe('static HttpModule (no register) shares instanceOptions across apps', async () => {
    const m1 = await Test.createTestingModule({ imports: [HttpModule] }).compile();
    const m2 = await Test.createTestingModule({ imports: [HttpModule] }).compile();
    const a = m1.get(HttpService), b = m2.get(HttpService);
    a.setGlobalDispatcher(new (require('undici').Agent)());
    const shared = a.undiciRef === b.undiciRef && !!b.undiciRef.dispatcher;
    await m1.close(); await m2.close();
    return shared ? 'SHARED: setGlobalDispatcher on app1 leaks into app2' : 'isolated';
  });

  console.log('open server connections at end:', openConns);
  server.closeAllConnections?.(); server.close();
})();
