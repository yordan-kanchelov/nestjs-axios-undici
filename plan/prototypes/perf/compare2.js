// Prototype replacement for benchmarks/micro/compare.js.
// Measures base vs head in alternating, interleaved rounds for several scenarios and reports, per scenario:
//  - rps change (median)            -- current statistic, noisy
//  - client CPU µs/request change   -- process.cpuUsage()/requests, less sensitive to server/scheduler contention
//  - overhead ratio vs raw undici   -- cpu(nau)/cpu(raw undici) measured in the same round, cancels runner speed
// plus a reference ratio vs @nestjs/axios (cpu and rps) for the "x faster" claim.
// node compare2.js --base <dir> --head <dir> [--rounds 6] [--duration 3] [--threshold 10] [--scenarios get,post,interceptors,error,config] [--json out.json]
const { fork, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1]]] : p), []));
const rounds = Number(args.rounds || 6), duration = String(args.duration || 3), threshold = Number(args.threshold || 10);
const scenarios = (args.scenarios || 'get,post,interceptors,error,config').split(',');
const builds = { base: path.resolve(args.base), head: path.resolve(args.head) };
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (h, b) => ((h - b) / b) * 100;
(async () => {
  const server = fork(path.join(__dirname, 'server.js'));
  const { port } = await new Promise((r) => server.once('message', r));
  const run = (impl, lib, scenario) => {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'client.js'), '--impl', impl, '--lib', lib, '--url', `http://127.0.0.1:${port}`, '--scenario', scenario, '--duration', duration, '--concurrency', args.concurrency || '50'], { encoding: 'utf8' });
    const j = JSON.parse(out.trim().split('\n').pop());
    if (j.errors) throw new Error(`${impl}:${scenario} ${j.errors} errors`);
    return j;
  };
  const S = {};
  for (let r = 0; r < rounds; r++) {
    const raw = run('raw', builds.head, 'get');
    const ref = args.reference === 'false' ? null : run('nestaxios', builds.head, 'get');
    for (const sc of scenarios) {
      S[sc] ??= { base: [], head: [], raw: [], ref: [] };
      for (const b of r % 2 ? ['head', 'base'] : ['base', 'head']) S[sc][b].push(run('nau', builds[b], sc));
      S[sc].raw.push(raw); if (ref) S[sc].ref.push(ref);
      const l = S[sc];
      console.error(`r${r + 1} ${sc}: base ${l.base.at(-1).rps.toFixed(0)} rps/${l.base.at(-1).cpuUsPerReq.toFixed(1)}µs head ${l.head.at(-1).rps.toFixed(0)} rps/${l.head.at(-1).cpuUsPerReq.toFixed(1)}µs raw ${raw.cpuUsPerReq.toFixed(1)}µs`);
    }
  }
  server.disconnect();
  let failed = false; const rows = []; const json = {};
  for (const sc of scenarios) {
    const l = S[sc];
    const rpsChg = pct(med(l.head.map((x) => x.rps)), med(l.base.map((x) => x.rps)));
    const cpuChg = pct(med(l.head.map((x) => x.cpuUsPerReq)), med(l.base.map((x) => x.cpuUsPerReq)));
    // per-round paired ratio (head/base) of CPU per request, median across rounds
    const pairedCpu = (med(l.head.map((x, i) => x.cpuUsPerReq / l.base[i].cpuUsPerReq)) - 1) * 100;
    const ovBase = med(l.base.map((x, i) => x.cpuUsPerReq / l.raw[i].cpuUsPerReq));
    const ovHead = med(l.head.map((x, i) => x.cpuUsPerReq / l.raw[i].cpuUsPerReq));
    const refCpu = l.ref.length ? med(l.ref.map((x, i) => x.cpuUsPerReq / l.head[i].cpuUsPerReq)) : NaN;
    const refRps = l.ref.length ? med(l.head.map((x, i) => x.rps / l.ref[i].rps)) : NaN;
    const bad = pairedCpu > threshold; failed ||= bad;
    json[sc] = { rpsChg, cpuChg, pairedCpu, ovBase, ovHead, refCpu, refRps };
    rows.push(`| ${sc} | ${rpsChg.toFixed(1)}% | ${cpuChg.toFixed(1)}% | ${pairedCpu.toFixed(1)}% | ${ovBase.toFixed(2)}x → ${ovHead.toFixed(2)}x | ${refRps.toFixed(1)}x rps, ${refCpu.toFixed(1)}x less CPU | ${bad ? 'regression' : 'ok'} |`);
  }
  const md = ['| scenario | rps Δ (median) | CPU/req Δ (median) | CPU/req Δ (paired) | CPU vs raw undici (base → head) | head vs @nestjs/axios (get) | result |', '|---|--:|--:|--:|--:|--:|---|', ...rows].join('\n');
  console.log(md);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ json, samples: S }, null, 1));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
