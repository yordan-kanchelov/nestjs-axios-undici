// Micro-benchmarks of individual hot-path stages (no I/O). node stages.js --lib <nau dir>
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const L = path.resolve(args.lib, 'lib/modules/http');
const req = require(L + '/adapters/axios-request.adapter');
const { createAxiosRefDefaults } = require(L + '/adapters/axios-ref.factory');
const { AxiosHeaders } = require(L + '/interfaces/axios-headers');
const { toAxiosError } = require(L + '/errors/axios-error');
const { createStatusError } = require(L + '/errors/axios-error');
const defaults = createAxiosRefDefaults({});
const bench = (name, fn, n = 300000) => { for (let i = 0; i < 20000; i++) fn(); const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) fn(); console.log(name.padEnd(55), (Number(process.hrtime.bigint() - t) / n).toFixed(0), 'ns'); };
bench('normalizeAxiosRequest fast path (get, no options)', () => req.normalizeAxiosRequest('http://x/json', { method: 'GET' }, { defaults, instanceOptions: {} }));
bench('normalizeAxiosRequest params+headers+timeout', () => req.normalizeAxiosRequest('http://x/json', { method: 'GET', params: { q: 'a b', page: 2 }, headers: { 'x-a': '1', Authorization: 'Bearer t' }, timeout: 5000 }, { defaults, instanceOptions: {} }));
bench('normalizeAxiosRequest post json', () => req.normalizeAxiosRequest('http://x/echo', { method: 'POST', data: { name: 'x', tags: ['a', 'b'], nested: { a: 1, b: 'two' } } }, { defaults, instanceOptions: {} }));
bench('mergeHeaders 5 sources (2 headers)', () => req.mergeHeaders(undefined, {}, {}, undefined, { 'x-a': '1', Authorization: 'Bearer t' }));
bench('buildURL 2 params', () => req.buildURL('http://x/json', { q: 'a b', page: 2 }));
bench('new AxiosHeaders + 3 set (axios req interceptor)', () => { const h = new AxiosHeaders(); h.set('x-a', '1'); h.set('Authorization', 'Bearer t'); h.set('content-type', 'application/json'); });
bench('object spread of options x2 (request()+executeRequest)', () => { const o = { method: 'GET', headers: {}, dispatcher: undefined }; const a = { ...o, x: 1 }; const { maxRedirections, ...r } = a; return { ...r, dispatcher: undefined }; });
bench('new Error (status error w/ stack)', () => new Error('Request failed with status code 404'), 100000);
