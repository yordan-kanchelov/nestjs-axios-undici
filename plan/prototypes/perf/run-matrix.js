// Runs client.js for several impl/scenario pairs in alternating rounds against one server.
// node run-matrix.js --lib <nau dir> [--rounds 3] [--duration 4] [--pairs raw:get,nau:get,nestaxios:get,...]
const { fork, execFileSync } = require('node:child_process');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const rounds = Number(args.rounds || 3);
const pairs = (args.pairs || 'raw:get,nau:get,nestaxios:get,raw:post,nau:post,nestaxios:post,nau:config,nestaxios:config,nau:interceptors,nestaxios:interceptors,nau:axiosref,nestaxios:axiosref,nau:error,nestaxios:error').split(',');
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
(async () => {
  const server = fork(path.join(__dirname, 'server.js'));
  const { port } = await new Promise((r) => server.once('message', r));
  const res = {};
  for (let r = 0; r < rounds; r++) for (const p of (r % 2 ? [...pairs].reverse() : pairs)) {
    const [impl, scenario] = p.split(':');
    const out = execFileSync(process.execPath, [...(args.nodeargs ? args.nodeargs.split(' ') : []), path.join(__dirname, 'client.js'), '--impl', impl, '--lib', args.lib, '--url', `http://127.0.0.1:${port}`, '--scenario', scenario, '--duration', args.duration || '4', '--concurrency', args.concurrency || '50'], { encoding: 'utf8' });
    const j = JSON.parse(out.trim().split('\n').pop());
    (res[p] ??= []).push(j);
    console.error(p, j.rps.toFixed(0), 'rps', j.cpuUsPerReq.toFixed(1), 'cpu-us/req', j.errors, 'err');
  }
  server.disconnect();
  console.log('| impl:scenario | median rps | min-max rps | median CPU µs/req | min-max CPU |');
  console.log('|---|--:|--:|--:|--:|');
  for (const p of pairs) {
    const rps = res[p].map((x) => x.rps), cpu = res[p].map((x) => x.cpuUsPerReq);
    console.log(`| ${p} | ${med(rps).toFixed(0)} | ${Math.min(...rps).toFixed(0)}-${Math.max(...rps).toFixed(0)} | ${med(cpu).toFixed(1)} | ${Math.min(...cpu).toFixed(1)}-${Math.max(...cpu).toFixed(1)} |`);
  }
})();
