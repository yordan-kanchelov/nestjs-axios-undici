// One measurement: node client.js --impl nau|nestaxios|raw --lib <nau lib dir> --url http://127.0.0.1:PORT --scenario get|post|interceptors|axiosref|error|config
// [--duration 5 | --requests N] [--concurrency 50]. Prints JSON { rps, cpuUsPerReq, requests, errors, heapMB, rssMB }.
require('reflect-metadata');
const path = require('node:path');
const { lastValueFrom } = require('rxjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const base = args.url.replace(/\/$/, '');
const durationMs = Number(args.duration || 5) * 1000;
const fixed = args.requests ? Number(args.requests) : 0;
const concurrency = Number(args.concurrency || 50);
const impl = args.impl, scenario = args.scenario;
const payload = { name: 'x', tags: ['a', 'b'], nested: { a: 1, b: 'two' } };
const pass = (r, n) => n.handle(r);

function build() {
  if (impl === 'raw') {
    const { request } = require(require.resolve('undici', { paths: [path.resolve(args.lib)] }));
    const ok = (s) => s >= 200 && s < 300;
    return {
      get: async () => { const r = await request(base + '/json'); const d = await r.body.json(); if (!ok(r.statusCode)) throw new Error(); return { status: r.statusCode, data: d }; },
      post: async () => { const r = await request(base + '/echo', { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } }); return { status: r.statusCode, data: await r.body.json() }; },
    }[scenario];
  }
  let svc;
  if (impl === 'nau') {
    const { HttpService } = require(path.resolve(args.lib));
    svc = scenario === 'interceptors' ? new HttpService({}, { interceptors: [pass, pass] }) : new HttpService({});
  } else {
    const { HttpService } = require(require.resolve('@nestjs/axios', { paths: [path.resolve(args.lib)] }));
    const axios = require(require.resolve('axios', { paths: [path.resolve(args.lib)] }));
    svc = new HttpService(axios.create());
  }
  if (scenario === 'interceptors') {
    // Same user-visible work on both sides: one axios request + one axios response interceptor.
    svc.axiosRef.interceptors.request.use((c) => { c.headers['x-trace'] = '1'; return c; });
    svc.axiosRef.interceptors.response.use((r) => r);
  }
  switch (scenario) {
    case 'get': case 'interceptors': return () => lastValueFrom(svc.get(base + '/json'));
    case 'post': return () => lastValueFrom(svc.post(base + '/echo', payload));
    case 'config': return () => lastValueFrom(svc.get(base + '/json', { params: { q: 'a b', page: 2 }, headers: { 'x-a': '1', Authorization: 'Bearer t' }, timeout: 5000 }));
    case 'axiosref': return () => svc.axiosRef.get(base + '/json');
    case 'error': return () => lastValueFrom(svc.get(base + '/404')).then(() => { throw new Error('expected 404'); }, (e) => ({ status: 200, data: e.response.data }));
  }
  throw new Error('unknown scenario ' + scenario);
}

async function main() {
  const once = build();
  const warmEnd = Date.now() + Number(args.warmup || 1000);
  await Promise.all(Array.from({ length: concurrency }, async () => { while (Date.now() < warmEnd) await once(); }));
  global.gc?.();
  let requests = 0, errors = 0;
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  const end = Date.now() + durationMs;
  const more = () => (fixed ? requests < fixed : Date.now() < end);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (more()) {
      requests++;
      try { const r = await once(); if (r.status !== 200 || r.data?.id !== 1) errors++; } catch (e) { errors++; if (process.env.DEBUG) console.error(e); }
    }
  }));
  const sec = Number(process.hrtime.bigint() - t0) / 1e9;
  const cpu = process.cpuUsage(cpu0);
  global.gc?.();
  const m = process.memoryUsage();
  console.log(JSON.stringify({ impl, scenario, rps: requests / sec, cpuUsPerReq: (cpu.user + cpu.system) / requests, requests, errors, heapMB: m.heapUsed / 2 ** 20, rssMB: m.rss / 2 ** 20 }));
}
main().catch((e) => { console.error(e); process.exit(1); });
