// Cost of attaching an AbortController signal per request (MockAgent, no sockets).
const path = require('node:path');
const undici = require(require.resolve('undici', { paths: [path.resolve(process.argv[2])] }));
const agent = new undici.MockAgent(); agent.disableNetConnect();
agent.get('http://m').intercept({ path: '/j', method: 'GET' }).reply(200, '{"id":1}', { headers: { 'content-type': 'application/json' } }).persist();
undici.setGlobalDispatcher(agent);
const variant = process.argv[3];
const fn = variant === 'signal' ? async () => { const c = new AbortController(); const r = await undici.request('http://m/j', { signal: c.signal }); await r.body.text(); }
  : async () => { const r = await undici.request('http://m/j'); await r.body.text(); };
(async () => { for (let i = 0; i < 10000; i++) await fn(); const N = 100000; const t = process.hrtime.bigint(); for (let i = 0; i < N; i++) await fn(); console.log(variant, (Number(process.hrtime.bigint() - t) / N / 1000).toFixed(2), 'µs/req'); })();
