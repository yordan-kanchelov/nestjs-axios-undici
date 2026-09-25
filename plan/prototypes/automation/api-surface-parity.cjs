// API-surface parity check: @nestjs/axios + axios vs nestjs-axios-undici.
// Usage (from repo root, after `npm run build`): node api-surface-parity.cjs [--json]
// Fails (exit 1) when a public member of the reference is missing and not in ALLOWED_GAPS.
require(require.resolve('reflect-metadata', { paths: [process.cwd()] }));
const path = require('node:path');
const root = process.cwd();
const req = m => require(require.resolve(m, { paths: [root] }));
const { Test } = req('@nestjs/testing');
const ref = req('@nestjs/axios');
const axios = req('axios');
const ours = require(path.join(root, process.env.LIB || 'lib/index.js'));

// Known, documented gaps. Anything else missing fails the check.
const ALLOWED_GAPS = new Set((process.env.ALLOWED_GAPS || '').split(',').filter(Boolean));

const members = obj => {
  const out = new Set();
  for (let o = obj; o && o !== Object.prototype && o !== Function.prototype; o = Object.getPrototypeOf(o))
    for (const k of Reflect.ownKeys(o)) if (typeof k === 'string' && k !== 'constructor' && !k.startsWith('_')) out.add(k);
  return out;
};
const shape = v => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

async function main() {
  const [refMod, ourMod] = await Promise.all([
    Test.createTestingModule({ imports: [ref.HttpModule.register({})] }).compile(),
    Test.createTestingModule({ imports: [ours.HttpModule.register({})] }).compile(),
  ]);
  const refSvc = refMod.get(ref.HttpService), ourSvc = ourMod.get(ours.HttpService);
  const pairs = {
    'package exports (@nestjs/axios)': [ref, ours],
    'HttpModule statics': [ref.HttpModule, ours.HttpModule],
    'HttpService': [refSvc, ourSvc],
    'axiosRef': [refSvc.axiosRef, ourSvc.axiosRef],
    'axiosRef.defaults': [refSvc.axiosRef.defaults, ourSvc.axiosRef.defaults],
    'axiosRef.defaults.headers': [refSvc.axiosRef.defaults.headers, ourSvc.axiosRef.defaults.headers],
    'axiosRef.interceptors.request': [refSvc.axiosRef.interceptors.request, ourSvc.axiosRef.interceptors.request],
    'axios named exports used with @nestjs/axios (AxiosError etc.)': [
      Object.fromEntries(['AxiosError', 'AxiosHeaders', 'CanceledError', 'isAxiosError', 'isCancel', 'CancelToken', 'HttpStatusCode', 'toFormData', 'mergeConfig', 'getAdapter'].map(k => [k, axios[k]])),
      ours,
    ],
    'AxiosError statics (codes)': [axios.AxiosError, ours.AxiosError],
    'AxiosError instance': [new axios.AxiosError('x', 'E'), ours.AxiosError ? new ours.AxiosError('x', 'E') : {}],
    'AxiosHeaders instance': [new axios.AxiosHeaders({ a: '1' }), ours.AxiosHeaders ? new ours.AxiosHeaders({ a: '1' }) : {}],
  };
  const report = {};
  let failures = 0;
  for (const [name, [a, b]] of Object.entries(pairs)) {
    const ma = members(a), mb = members(b);
    const missing = [...ma].filter(k => !mb.has(k));
    const typeMismatch = [...ma].filter(k => mb.has(k) && shape(a[k]) !== shape(b[k])).map(k => `${k} (${shape(a[k])} vs ${shape(b[k])})`);
    const unexpected = missing.filter(k => !ALLOWED_GAPS.has(`${name}:${k}`));
    failures += unexpected.length;
    report[name] = { missing, typeMismatch, extra: [...mb].filter(k => !ma.has(k)).length };
  }
  await Promise.all([refMod.close(), ourMod.close()]);
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else for (const [n, r] of Object.entries(report)) console.log(`${n}\n  missing: ${r.missing.join(', ') || '-'}\n  type mismatch: ${r.typeMismatch.join(', ') || '-'}\n  extra members: ${r.extra}`);
  process.exitCode = failures ? 1 : 0;
}
main().catch(e => { console.error(e); process.exit(2); });
