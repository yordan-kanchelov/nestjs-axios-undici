// Probes behaviour when Node's bundled undici owns the global dispatcher (global fetch used first).
// Usage (from a consumer dir): NODE_PATH=$PWD/node_modules node dup-undici-probe.js [--no-fetch-first]
const FETCH_FIRST = !process.argv.includes("--no-fetch-first");
require("reflect-metadata");
const http = require('node:http');
const { Test } = require('@nestjs/testing');
const { firstValueFrom } = require('rxjs');
let undici, HttpModule, HttpService;
const server = http.createServer((req, res) => {
  if (req.url === '/redir') { res.writeHead(302, { location: '/ok' }); return res.end(); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ url: req.url, body })); });
});
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  if (FETCH_FIRST) await (await fetch(base + '/warm')).text(); // before npm undici is loaded
  undici = require('undici'); ({ HttpModule, HttpService } = require('nestjs-axios-undici'));
  const gd = undici.getGlobalDispatcher();
  console.log('node', process.version, 'bundled undici', process.versions.undici, 'npm undici', require('undici/package.json').version);
  console.log('global dispatcher from npm undici copy?', gd instanceof undici.Dispatcher, gd.constructor.name);
  for (const [name, opts] of [['plain', {}], ['maxRedirects:5', { maxRedirects: 5 }], ['timeout', { timeout: 2000 }]]) {
    const mod = await Test.createTestingModule({ imports: [HttpModule.register(opts)] }).compile();
    const h = mod.get(HttpService);
    for (const [label, obs] of [['GET', () => h.get(base + '/ok')], ['POST json', () => h.post(base + '/p', { a: 1 })], ['GET redirect', () => h.get(base + '/redir')], ['postForm FormData', () => { const f = new FormData(); f.append('x', '1'); return h.postForm(base + '/f', f); }]]) {
      try { const r = await Promise.race([firstValueFrom(obs()), new Promise((_, j) => setTimeout(() => j(new Error('HUNG >3s')), 3000))]); console.log(`  [${name}] ${label}: ${r.status} ${JSON.stringify(r.data).slice(0, 60)}`); }
      catch (e) { console.log(`  [${name}] ${label}: ERR ${e.code || ''} ${e.message} ${e.response ? e.response.status : ''}`); }
    }
    await mod.close();
  }
  server.closeAllConnections(); server.close(); process.exit(0);
})();
