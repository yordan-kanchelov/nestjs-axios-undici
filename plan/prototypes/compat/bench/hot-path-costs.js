const { request, Agent, interceptors } = require('undici');
const http = require('node:http');
const srv = http.createServer((q, r) => { r.setHeader('content-type','application/json'); r.end('{"a":1}'); });
srv.listen(0, async () => {
  const url = `http://127.0.0.1:${srv.address().port}/x`;
  const base = new Agent();
  const redir = base.compose(interceptors.redirect({ maxRedirections: 21 }));
  const decomp = interceptors.decompress ? base.compose(interceptors.decompress()) : null;
  const both = decomp ? base.compose(interceptors.redirect({ maxRedirections: 21 }), interceptors.decompress()) : null;
  const variants = {
    plain: () => request(url, { dispatcher: base }),
    signal: () => { const c = new AbortController(); return request(url, { dispatcher: base, signal: c.signal }); },
    timer: () => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 5000); return request(url, { dispatcher: base, signal: c.signal }).finally(() => clearTimeout(t)); },
    redirect: () => request(url, { dispatcher: redir }),
    redirect_decompress: both && (() => request(url, { dispatcher: both })),
    headers: () => request(url, { dispatcher: base, headers: { accept: 'application/json, text/plain, */*', 'user-agent': 'axios/1.20.0', 'accept-encoding': 'gzip, compress, deflate, br' } }),
  };
  const N = 20000, C = 50;
  for (let round = 0; round < 2; round++) for (const [name, fn] of Object.entries(variants)) {
    if (!fn) continue;
    let i = 0; const t0 = process.hrtime.bigint();
    await Promise.all(Array.from({ length: C }, async () => { while (i++ < N) { const r = await fn(); await r.body.json(); } }));
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (round) console.log(name.padEnd(20), (N / ms * 1000).toFixed(0), 'req/s');
  }
  srv.close(); base.close();
});
