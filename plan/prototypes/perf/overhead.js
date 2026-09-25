// Library-only overhead per request: undici MockAgent (no sockets) as dispatcher for both raw undici and HttpService.
// node overhead.js --lib <nau dir> [--n 100000]
require('reflect-metadata');
const path = require('node:path');
const { lastValueFrom } = require('rxjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const lib = path.resolve(args.lib);
const undici = require(require.resolve('undici', { paths: [lib] }));
const { HttpService } = require(lib);
const N = Number(args.n || 100000);
const body = JSON.stringify({ id: 1, name: 'Mock Service Response', data: { status: 'success', message: 'Response from mock service', value: 0.5 } });
const agent = new undici.MockAgent({ connections: 1 });
agent.disableNetConnect();
const pool = agent.get('http://mock.local');
for (const [m, p, s] of [['GET', '/json', 200], ['POST', '/echo', 200], ['GET', '/404', 404], ['GET', /\/json\?.*/, 200]]) pool.intercept({ path: p, method: m }).reply(s, body, { headers: { 'content-type': 'application/json' } }).persist();
undici.setGlobalDispatcher(agent);
const url = 'http://mock.local';
const payload = { name: 'x', tags: ['a', 'b'], nested: { a: 1, b: 'two' } };
const pass = (r, n) => n.handle(r);
const svc = new HttpService({});
const svcI = new HttpService({}, { interceptors: [pass, pass] });
svcI.axiosRef.interceptors.request.use((c) => { c.headers['x-trace'] = '1'; return c; });
svcI.axiosRef.interceptors.response.use((r) => r);
const svcN = new HttpService({}, { interceptors: [pass, pass] });
const cases = {
  'raw undici request()+json': async () => { const r = await undici.request(url + '/json'); await r.body.json(); },
  'nau get': () => lastValueFrom(svc.get(url + '/json')),
  'nau axiosRef.get': () => svc.axiosRef.get(url + '/json'),
  'nau post json': () => lastValueFrom(svc.post(url + '/echo', payload)),
  'nau get params+headers+timeout': () => lastValueFrom(svc.get(url + '/json', { params: { q: 'a b', page: 2 }, headers: { 'x-a': '1', Authorization: 'Bearer t' }, timeout: 5000 })),
  'nau get + 2 native interceptors': () => lastValueFrom(svcN.get(url + '/json')),
  'nau get + 2 native + axios req/res interceptors': () => lastValueFrom(svcI.get(url + '/json')),
  'nau get 404 (error path)': () => lastValueFrom(svc.get(url + '/404')).catch((e) => e),
};
(async () => {
  const only = args.only ? new RegExp(args.only) : null;
  for (const [name, fn] of Object.entries(cases)) {
    if (only && !only.test(name)) continue;
    for (let i = 0; i < 5000; i++) await fn();
    const res = [];
    for (let rep = 0; rep < 3; rep++) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N; i++) await fn();
      res.push(Number(process.hrtime.bigint() - t0) / N / 1000);
    }
    res.sort((a, b) => a - b);
    console.log(`${name.padEnd(48)} ${res[1].toFixed(2)} µs/req (min ${res[0].toFixed(2)}, max ${res[2].toFixed(2)})`);
  }
})();
