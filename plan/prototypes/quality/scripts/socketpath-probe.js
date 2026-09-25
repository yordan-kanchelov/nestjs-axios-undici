// socketPath: axios sends the request over a unix socket. Checks what we do.
require('reflect-metadata');
const http = require('node:http'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Test } = require('@nestjs/testing'); const { firstValueFrom } = require('rxjs');
const { HttpModule, HttpService } = require('nestjs-axios-undici');
const sock = path.join(os.tmpdir(), `nau-${process.pid}.sock`);
const srv = http.createServer((q, s) => s.end('via-socket ' + q.url));
srv.listen(sock, async () => {
  for (const opts of [{ socketPath: sock }, { socketPath: sock, baseURL: 'http://localhost' }]) {
    const warn = console.warn; const w = []; console.warn = (...a) => w.push(a.join(' '));
    const m = await Test.createTestingModule({ imports: [HttpModule.register(opts)] }).compile();
    console.warn = warn;
    try { const r = await firstValueFrom(m.get(HttpService).get('http://localhost/x')); console.log(JSON.stringify(opts), '->', r.status, r.data.toString()); }
    catch (e) { console.log(JSON.stringify(opts), '-> ERR', e.code, e.message); }
    if (w.length) console.log('   warnings:', w.join(' | '));
    await m.close();
  }
  srv.close(); fs.rmSync(sock, { force: true });
});
