// Shared plumbing for the upstream conformance suites (tests/upstream/*).
//
// Each suite (nestjs-axios, axios strategy a, axios strategy b) clones its
// upstream project at a pinned tag, runs one of *its own, unmodified* spec
// files against this package, and diffs the resulting pass/fail set against
// a checked-in `expected-failures.json` (test full name -> reason), the same
// `knownDifference` discipline `tests/compat/differential/harness.ts` uses:
//
//   - a test that's expected to fail and does: fine, counted, not printed.
//   - a test that's expected to fail and now PASSES: the job fails ("remove
//     from list" - the fix landed, the expected-failures entry is stale).
//   - a test that isn't listed and fails: the job fails (a new regression).
//
// Nothing here touches src/.
'use strict';

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

export function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      const name = JSON.parse(readFileSync(pkg, 'utf8')).name;
      if (name === 'nestjs-axios-undici') return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('could not find repo root (package.json "nestjs-axios-undici")');
}

export const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

/** Builds this repo's `lib/` once. Cheap (~2s); safe to call from every suite. */
export function buildLib() {
  execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
}

/**
 * Base directory for a suite's clone, when `--clone-dir` isn't passed:
 * `$CONFORMANCE_CLONE_ROOT` if set (the CI workflow points this at a cached
 * directory, keyed by these run.mjs files' content, so a pin bump busts the
 * cache automatically), else a fixed spot under the OS temp dir.
 */
export function defaultCloneDir(name) {
  const root = process.env.CONFORMANCE_CLONE_ROOT ?? path.join(os.tmpdir(), 'conformance-clones');
  return path.join(root, name);
}

/**
 * Clones `url` at the pinned tag `ref` into `dir` (shallow, depth 1),
 * reusing an existing clone if `dir` already exists - the CI workflow keys
 * its cache on `ref`, so a cache hit skips this entirely.
 */
export function ensureClone({ url, ref, dir }) {
  if (existsSync(path.join(dir, '.git'))) {
    console.log(`  (reusing existing clone of ${url} @ ${ref} in ${dir})`);
    return;
  }
  mkdirSync(path.dirname(dir), { recursive: true });
  console.log(`  cloning ${url} @ ${ref} into ${dir} ...`);
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', ref, url, dir],
    { stdio: 'inherit' },
  );
}

/** Reads `expected-failures.json`: { "<test full name>": "<reason>" }. */
export function loadExpectedFailures(file) {
  if (!existsSync(file)) return {};
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: expected a JSON object of {testName: reason}`);
  }
  return data;
}

/**
 * Normalizes a test's full name so it's stable across the different ways
 * this repo's tools print a `describe`/`it` chain (Jest and Vitest's own
 * `--reporter=json` join nested describes with a plain space; `vitest
 * list`'s own output, and its console reporters, join with ` > `) - both
 * collapse to the same key, so an expected-failures entry, or a name this
 * runner builds itself (e.g. for a chunk that produced no report at all),
 * matches regardless of which tool produced it.
 */
export function normalizeTestName(name) {
  return name
    .replace(/\s*>\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Runs a Jest- or Vitest-produced JSON report (both use the same
 * `--json`/`--reporter=json` `testResults[].assertionResults[]` shape, with
 * `fullName` and `status` per test) into a flat list of
 * `{ fullName, status }`, `status` one of 'passed' | 'failed' | 'other'.
 */
export function readJsonReport(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const out = [];
  for (const suite of raw.testResults ?? []) {
    for (const a of suite.assertionResults ?? []) {
      const status =
        a.status === 'passed' || a.status === 'failed' ? a.status : 'other';
      out.push({ fullName: normalizeTestName(a.fullName), status });
    }
  }
  return out;
}

/**
 * Diffs a suite's actual results against its expected-failures list and
 * returns the four buckets the task asks for, plus whether the run should
 * fail: `newFailures.length > 0 || fixed.length > 0`.
 */
export function diffResults(results, expected) {
  const passed = [];
  const expectedFail = [];
  const newFailures = [];
  const fixed = [];
  const seen = new Set();

  // A chunked run (tests/upstream/axios/run.mjs) can, rarely, run the same
  // test twice (a leaf title from one chunk matching as a substring inside
  // another test's full name); keep only the last result for a given name
  // rather than double-counting it.
  const byName = new Map();
  for (const r of results) byName.set(r.fullName, r);

  for (const r of byName.values()) {
    seen.add(r.fullName);
    const isExpected = Object.prototype.hasOwnProperty.call(expected, r.fullName);
    if (r.status === 'failed') {
      if (isExpected) expectedFail.push(r);
      else newFailures.push(r);
    } else if (r.status === 'passed') {
      if (isExpected) fixed.push(r);
      else passed.push(r);
    }
  }

  // An expected-failures entry for a test the suite no longer even runs
  // (renamed/removed upstream) is just as stale as one that now passes -
  // surface it the same way so the list stays accurate.
  const stale = Object.keys(expected).filter(name => !seen.has(name));

  return { passed, expectedFail, newFailures, fixed, stale };
}

/** Prints the short summary the task asks for, and appends it to $GITHUB_STEP_SUMMARY if set. */
export function printSummary(suiteName, diff) {
  const lines = [];
  lines.push(`### ${suiteName}`);
  lines.push('');
  lines.push(
    `passed: ${diff.passed.length}, expected failures: ${diff.expectedFail.length}, ` +
      `new failures: ${diff.newFailures.length}, fixed (remove from list): ${diff.fixed.length}` +
      (diff.stale.length ? `, stale entries: ${diff.stale.length}` : ''),
  );
  if (diff.newFailures.length) {
    lines.push('');
    lines.push('New failures (not in expected-failures.json):');
    for (const r of diff.newFailures) lines.push(`  - ${r.fullName}`);
  }
  if (diff.fixed.length) {
    lines.push('');
    lines.push('Now passing (remove from expected-failures.json):');
    for (const r of diff.fixed) lines.push(`  - ${r.fullName}`);
  }
  if (diff.stale.length) {
    lines.push('');
    lines.push('In expected-failures.json but not seen this run (stale entry):');
    for (const name of diff.stale) lines.push(`  - ${name}`);
  }
  const text = lines.join('\n');
  console.log(`\n${text}\n`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`, { flag: 'a' });
    } catch {
      // Non-fatal: CI still gets the console output above.
    }
  }
}

export function isSuiteFailing(diff) {
  return diff.newFailures.length > 0 || diff.fixed.length > 0 || diff.stale.length > 0;
}

/** Thin wrapper around spawnSync that always inherits stdio and returns the exit status. */
export function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
