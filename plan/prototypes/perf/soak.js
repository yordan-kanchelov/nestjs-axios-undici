// Sustained-load heap check: node --expose-gc soak.js --lib <nau dir> --url http://127.0.0.1:PORT [--total 200000] [--scenario get|interceptors|error|post]
require('reflect-metadata');
const path = require('node:path');
const { lastValueFrom } = require('rxjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const { HttpService } = require(path.resolve(args.lib));
const total = Number(args.total || 200000), step = total / 8, conc = 50;
const pass = (r, n) => n.handle(r);
const svc = args.scenario === 'interceptors' ? new HttpService({}, { interceptors: [pass] }) : new HttpService({});
if (args.scenario === 'interceptors') { svc.axiosRef.interceptors.request.use((c) => c); svc.axiosRef.interceptors.response.use((r) => r); }
const target = args.scenario === 'error' ? '/404' : '/json';
const once = args.scenario === 'post' ? () => lastValueFrom(svc.post(args.url + '/echo', { a: 1 })) : () => lastValueFrom(svc.get(args.url + target)).catch((e) => e);
(async () => {
  let done = 0, next = step; const t0 = Date.now();
  const heap = () => { global.gc(); global.gc(); return (process.memoryUsage().heapUsed / 2 ** 20).toFixed(1); };
  console.log(`0 req heap ${heap()} MB`);
  await Promise.all(Array.from({ length: conc }, async () => { while (done < total) { await once(); done++; if (done >= next) { next += step; console.log(`${done} req heap ${heap()} MB rss ${(process.memoryUsage().rss / 2 ** 20).toFixed(0)} MB`); } } }));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
