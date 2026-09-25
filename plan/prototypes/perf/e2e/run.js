// End-to-end A/B: nestjs-axios-undici vs @nestjs/axios in the same NestJS app, same runner, alternating rounds.
// Reports median req/s and latency per client and the ratio (runner speed cancels out). No Docker, no k6.
// node run.js [--rounds 5] [--duration 10] [--connections 50] [--interceptor] [--pin] [--markdown out.md] [--json out.json]
// --pin uses taskset: load generator on CPU 0, app on CPU 1, upstream on CPUs 2-3 (4-vCPU GitHub runner).
const { fork } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('autocannon');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : p), []));
const rounds = Number(args.rounds || 5), duration = Number(args.duration || 10), connections = Number(args.connections || 50);
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pin = (cpus, file, argv) => args.pin ? fork(file, argv, { execPath: 'taskset', execArgv: ['-c', cpus, process.execPath] }) : fork(file, argv);
const ready = (child) => new Promise((resolve, reject) => { child.once('message', resolve); child.once('exit', (c) => reject(new Error('exited ' + c))); });
if (args.pin) { try { require('node:child_process').execFileSync('taskset', ['-cp', '0', String(process.pid)]); } catch {} }
(async () => {
  const up = pin('2-3', path.join(__dirname, 'upstream.js'), ['3099']); await ready(up);
  const res = { nau: [], axios: [] };
  for (let r = 0; r < rounds; r++) {
    for (const client of r % 2 ? ['axios', 'nau'] : ['nau', 'axios']) {
      const app = pin('1', path.join(__dirname, 'app.js'), ['--client', client, '--port', '3100', '--upstream', 'http://127.0.0.1:3099/api/data', ...(args.interceptor ? ['--interceptor'] : [])]);
      await ready(app);
      await autocannon({ url: 'http://127.0.0.1:3100/api', connections, duration: 2 }); // warm-up
      const out = await autocannon({ url: 'http://127.0.0.1:3100/api', connections, duration });
      if (out.non2xx || out.errors) throw new Error(`${client}: ${out.non2xx} non-2xx, ${out.errors} errors`);
      res[client].push({ rps: out.requests.average, p50: out.latency.p50, p99: out.latency.p99 });
      console.error(`round ${r + 1} ${client}: ${out.requests.average.toFixed(0)} req/s, p50 ${out.latency.p50} ms, p99 ${out.latency.p99} ms`);
      app.kill(); await new Promise((r2) => app.once('exit', r2));
    }
  }
  up.kill();
  const m = (c, k) => med(res[c].map((x) => x[k]));
  const ratios = res.nau.map((x, i) => x.rps / res.axios[i].rps);
  const md = [
    `## End-to-end: nestjs-axios-undici vs @nestjs/axios${args.interceptor ? ' (with interceptors)' : ''}`, '',
    `NestJS + Fastify endpoint making 5 parallel upstream calls; autocannon, ${connections} connections, ${rounds} alternating rounds of ${duration}s, Node.js ${process.version}.`, '',
    '| Client | req/s (median) | p50 ms | p99 ms |', '|---|--:|--:|--:|',
    `| @nestjs/axios | ${m('axios', 'rps').toFixed(0)} | ${m('axios', 'p50')} | ${m('axios', 'p99')} |`,
    `| nestjs-axios-undici | ${m('nau', 'rps').toFixed(0)} | ${m('nau', 'p50')} | ${m('nau', 'p99')} |`, '',
    `**Throughput ratio: ${med(ratios).toFixed(2)}x** (per-round ratios ${ratios.map((x) => x.toFixed(2)).join(', ')})`, '',
  ].join('\n');
  console.log(md);
  if (args.markdown) fs.writeFileSync(args.markdown, md);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ ratio: med(ratios), ratios, res }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
