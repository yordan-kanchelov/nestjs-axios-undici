#!/usr/bin/env node
// Consumer-level package test: install the packed tarball into fresh projects with only the
// declared peers for each supported combination and run the smoke scenario via CJS and ESM.
// Usage: node run-matrix.mjs --tarball <file.tgz> [--work <dir>] [--only nest12-undici8] [--node /path/to/node ...]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  tarball: { type: 'string' }, work: { type: 'string', default: join(here, '.runs') },
  only: { type: 'string', multiple: true }, node: { type: 'string', multiple: true },
} });
const tarball = resolve(values.tarball);
const nodes = values.node?.length ? values.node : [process.execPath];

// Supported-version matrix. "min" rows pin the lowest versions the peer ranges allow.
export const MATRIX = [
  { id: 'nest10-undici7-min', nest: '10.0.0', undici: '7.0.0', rxjs: '7.1.0', reflect: '0.1.13' },
  { id: 'nest10-undici8',     nest: '^10',    undici: '^8',    rxjs: '^7',    reflect: '^0.2' },
  { id: 'nest11-undici7',     nest: '^11',    undici: '^7',    rxjs: '^7',    reflect: '^0.2' },
  { id: 'nest11-undici8',     nest: '^11',    undici: '^8',    rxjs: '^7',    reflect: '^0.2' },
  { id: 'nest12-undici7',     nest: '^12',    undici: '^7',    rxjs: '7.1.0', reflect: '^0.2' },
  { id: 'nest12-undici8',     nest: '^12',    undici: '^8',    rxjs: '^7',    reflect: '^0.2' },
];

const results = [];
for (const combo of MATRIX.filter(c => !values.only || values.only.includes(c.id))) {
  const dir = join(values.work, combo.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `consumer-${combo.id}`, private: true, type: 'commonjs',
    dependencies: {
      'nestjs-axios-undici': `file:${tarball}`,
      '@nestjs/common': combo.nest, '@nestjs/core': combo.nest,
      undici: combo.undici, rxjs: combo.rxjs, 'reflect-metadata': combo.reflect,
    },
  }, null, 2));
  for (const f of ['scenario.cjs', 'smoke.cjs', 'smoke.mjs']) copyFileSync(join(here, f), join(dir, f));
  let t = Date.now();
  // Fails on peer conflicts (no --legacy-peer-deps), like a consumer's `npm install` would
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--prefer-offline', '--loglevel=error'], { cwd: dir, stdio: 'inherit' });
  const installMs = Date.now() - t;
  const versions = Object.fromEntries(['@nestjs/common', 'undici', 'rxjs', 'reflect-metadata']
    .map(p => [p, JSON.parse(readFileSync(join(dir, 'node_modules', p, 'package.json'), 'utf8')).version]));
  for (const node of nodes) {
    const nodeVersion = execFileSync(node, ['-v'], { encoding: 'utf8' }).trim();
    for (const entry of ['smoke.cjs', 'smoke.mjs']) {
      t = Date.now();
      const r = spawnSync(node, [entry], { cwd: dir, encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
      const ok = r.status === 0;
      results.push({ combo: combo.id, node: nodeVersion, entry, ok, ms: Date.now() - t, installMs, versions });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${combo.id} ${nodeVersion} ${entry} (${Date.now() - t}ms)`);
      if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(0, 25).join('\n'));
    }
  }
}
writeFileSync(join(values.work, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
