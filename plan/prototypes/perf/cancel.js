// Does unsubscribing (e.g. rxjs timeout()/switchMap/takeUntil) abort the in-flight request?
// node cancel.js --impl nau|nestaxios --lib <nau dir> --url http://127.0.0.1:PORT   (server /slow answers after 2s)
require('reflect-metadata');
const path = require('node:path');
const { timeout, lastValueFrom } = require('rxjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const lib = path.resolve(args.lib);
let svc;
if (args.impl === 'nau') svc = new (require(lib).HttpService)({});
else svc = new (require(require.resolve('@nestjs/axios', { paths: [lib] })).HttpService)(require(require.resolve('axios', { paths: [lib] })).create());
(async () => {
  const N = 100;
  const t0 = Date.now();
  const results = await Promise.allSettled(Array.from({ length: N }, () => lastValueFrom(svc.get(args.url + '/slow').pipe(timeout(100)))));
  console.log(args.impl, 'rejected', results.filter((r) => r.status === 'rejected').length, 'in', Date.now() - t0, 'ms');
  await new Promise((r) => setTimeout(r, 300));
  const stats = await fetch(args.url + '/__stats').then((r) => r.json());
  console.log(args.impl, 'server saw client abort (closedEarly):', stats.closedEarly, 'of', N);
  process.exit(0);
})();
