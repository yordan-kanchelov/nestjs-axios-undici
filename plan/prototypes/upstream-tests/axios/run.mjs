#!/usr/bin/env node
// Usage: node plan/prototypes/upstream-tests/axios/run.mjs [--ref v1.20.0]
//          [--file tests/unit/adapters/http.test.js] [-t "<vitest -t filter>"]
//          [--clone-dir DIR] [--keep]
//
// Strategy (b) prototype: clones axios at the given tag, `npm install`s it
// (its own vitest/express/multer/etc. dev deps - no --ignore-scripts here,
// husky's prepare script is harmless and there's no browser project in the
// generated config below, so playwright's binaries are never touched), then
// runs one of ITS OWN, UNMODIFIED unit test files with `axios.defaults.adapter`
// monkey-patched to `undici-adapter.cjs` - a small adapter built from this
// repo's own response/error/redirect code (see that file's header comment)
// plus a bare `undici.request()` call. This exercises this package's
// transport + response/error adaptation inside real axios; it does NOT
// exercise this package's interceptor or config-normalization pipeline
// (axiosRef), which strategy (a) - see ../nestjs-axios/ for the sibling
// prototype against @nestjs/axios - covers instead.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      const name = JSON.parse(readFileSync(pkg, 'utf8')).name;
      if (name === 'nestjs-axios-undici') return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error('could not find repo root (package.json "nestjs-axios-undici")');
}

const REPO_ROOT = findRepoRoot(HERE);

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const REF = flag('ref', 'v1.20.0');
const FILE = flag('file', 'tests/unit/adapters/http.test.js');
const FILTER = (() => {
  const i = args.indexOf('-t');
  return i === -1 ? undefined : args[i + 1];
})();
const KEEP = args.includes('--keep');
const CLONE_DIR = flag('clone-dir', null) ?? path.join(os.tmpdir(), `axios-upstream-${REF}`);

console.log(`[1/5] building this repo's lib/ ...`);
execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });
const LIB_DIR = path.join(REPO_ROOT, 'lib', 'modules', 'http');
if (!existsSync(LIB_DIR)) throw new Error(`expected ${LIB_DIR} after build`);

console.log(`[2/5] cloning axios @ ${REF} into ${CLONE_DIR} ...`);
if (!existsSync(CLONE_DIR)) {
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', REF, 'https://github.com/axios/axios.git', CLONE_DIR],
    { stdio: 'inherit' },
  );
} else {
  console.log('  (reusing existing clone)');
}

console.log(`[3/5] npm install in the clone (its own vitest/express/etc.) ...`);
if (!existsSync(path.join(CLONE_DIR, 'node_modules'))) {
  execFileSync('npm', ['install', '--ignore-scripts'], { cwd: CLONE_DIR, stdio: 'inherit' });
} else {
  console.log('  (reusing existing node_modules)');
}

console.log('[4/5] writing the adapter-swap setup file + a unit-only vitest config ...');
const setupPath = path.join(CLONE_DIR, '.prototype-setup.mjs');
writeFileSync(
  setupPath,
  `import axios from ${JSON.stringify(path.join(CLONE_DIR, 'index.js'))};
import buildFullPath from ${JSON.stringify(path.join(CLONE_DIR, 'lib', 'core', 'buildFullPath.js'))};
import { makeAdapter } from ${JSON.stringify(path.join(HERE, 'undici-adapter.cjs'))};

axios.defaults.adapter = makeAdapter({ buildFullPath });
`,
);

const vitestConfigPath = path.join(CLONE_DIR, '.prototype-vitest.config.mjs');
writeFileSync(
  vitestConfigPath,
  `import { defineConfig } from 'vitest/config';

// Unit project only (no browser project => no playwright dependency).
export default defineConfig({
  test: {
    testTimeout: 15000,
    environment: 'node',
    include: [${JSON.stringify(FILE)}],
    setupFiles: [${JSON.stringify(setupPath)}],
  },
});
`,
);

console.log('[5/5] running the unmodified upstream spec against our adapter ...\n');
const vitestBin = path.join(CLONE_DIR, 'node_modules', '.bin', 'vitest');
const vitestArgs = ['run', '--config', vitestConfigPath];
if (FILTER) vitestArgs.push('-t', FILTER);
const result = spawnSync(vitestBin, vitestArgs, {
  cwd: CLONE_DIR,
  stdio: 'inherit',
  env: { ...process.env, PROTOTYPE_REPO_LIB_DIR: LIB_DIR },
});

if (!KEEP) {
  rmSync(setupPath, { force: true });
  rmSync(vitestConfigPath, { force: true });
}

process.exit(result.status ?? 1);
