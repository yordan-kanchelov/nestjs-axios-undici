#!/usr/bin/env node
// Compares HttpService throughput of two library builds on the same machine.
// Usage: node compare.js --base <libDir> --head <libDir> [--rounds 5] [--duration 5] [--threshold 10] [--markdown out.md]
//
// Base and head are measured alternately in fresh processes, and medians are
// compared, so machine noise affects both sides equally. Exits 1 when a
// scenario's median throughput drops by more than --threshold percent.
const { fork, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), [])
);
const rounds = Number(args.rounds || 5);
const duration = Number(args.duration || 5);
const threshold = Number(args.threshold || 10);
const scenarios = (args.scenarios || 'request,interceptors').split(',');
const builds = { base: path.resolve(args.base), head: path.resolve(args.head) };

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function measure(lib, url, scenario) {
  const out = execFileSync(
    process.execPath,
    [path.join(__dirname, 'http-service.bench.js'), '--lib', lib, '--url', url, '--scenario', scenario, '--duration', String(duration)],
    { encoding: 'utf8' }
  );
  const result = JSON.parse(out.trim().split('\n').pop());
  if (result.errors > 0) throw new Error(`${scenario} on ${lib}: ${result.errors} failed requests`);
  return result.rps;
}

async function main() {
  const server = fork(path.join(__dirname, 'server.js'));
  const { port } = await new Promise((resolve) => server.once('message', resolve));
  const url = `http://127.0.0.1:${port}/`;

  const samples = {};
  try {
    for (const scenario of scenarios) {
      samples[scenario] = { base: [], head: [] };
      for (let round = 0; round < rounds; round++) {
        // Alternate the order each round so neither build always runs second.
        const order = round % 2 ? ['head', 'base'] : ['base', 'head'];
        for (const name of order) samples[scenario][name].push(measure(builds[name], url, scenario));
        console.error(`${scenario} round ${round + 1}/${rounds}: base ${samples[scenario].base.at(-1).toFixed(0)} req/s, head ${samples[scenario].head.at(-1).toFixed(0)} req/s`);
      }
    }
  } finally {
    server.disconnect();
  }

  let regressed = false;
  const rows = scenarios.map((scenario) => {
    const base = median(samples[scenario].base);
    const head = median(samples[scenario].head);
    const change = ((head - base) / base) * 100;
    const failed = change < -threshold;
    regressed ||= failed;
    return `| ${scenario} | ${base.toFixed(0)} | ${head.toFixed(0)} | ${change >= 0 ? '+' : ''}${change.toFixed(1)}% | ${failed ? '❌ regression' : '✅'} |`;
  });

  const markdown = [
    '## HttpService micro-benchmark',
    '',
    `Median throughput over ${rounds} alternating rounds of ${duration}s (50 concurrent requests, Node.js ${process.version}). Fails below -${threshold}%.`,
    '',
    '| Scenario | Base (req/s) | Head (req/s) | Change | Result |',
    '|----------|-------------:|-------------:|-------:|--------|',
    ...rows,
    '',
  ].join('\n');
  console.log(markdown);
  if (args.markdown) fs.writeFileSync(args.markdown, markdown);
  process.exit(regressed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
