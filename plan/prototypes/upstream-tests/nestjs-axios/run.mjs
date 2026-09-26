#!/usr/bin/env node
// Usage: node plan/prototypes/upstream-tests/nestjs-axios/run.mjs [--ref 12.0.1] [--keep] [--clone-dir DIR]
//
// Clones nestjs/axios at the given tag, copies its transferable-as-is specs
// (tests/http.service.spec.ts, tests/http.module.spec.ts) into a scratch
// working dir inside this prototype folder, points their `../lib/index.js`
// and `../lib/http.constants.js` imports at this repo's built HttpModule/
// HttpService via jest moduleNameMapper (see shims/), and runs them with
// this repo's own Jest + ts-jest. Prints a pass/fail summary per file.
// tests/esm.spec.ts is intentionally NOT copied: it only checks @nestjs/
// axios's own dist/package.json packaging contract, not shared behaviour.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  cpSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
const REF = flag('ref', '12.0.1');
const KEEP = args.includes('--keep');
const CLONE_DIR =
  flag('clone-dir', null) ??
  path.join(os.tmpdir(), `nestjs-axios-upstream-${REF}`);
const WORK_DIR = path.join(HERE, `.run-${Date.now()}`);

console.log(`[1/5] building this repo's lib/ ...`);
execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit' });

console.log(`[2/5] cloning nestjs/axios @ ${REF} into ${CLONE_DIR} ...`);
if (!existsSync(CLONE_DIR)) {
  execFileSync(
    'git',
    ['clone', '--depth', '1', '--branch', REF, 'https://github.com/nestjs/axios.git', CLONE_DIR],
    { stdio: 'inherit' },
  );
} else {
  console.log('  (reusing existing clone)');
}

console.log(`[3/5] copying transferable specs into ${WORK_DIR} ...`);
mkdirSync(path.join(WORK_DIR, 'tests'), { recursive: true });
const SPECS = ['tests/http.service.spec.ts', 'tests/http.module.spec.ts'];
for (const spec of SPECS) {
  cpSync(path.join(CLONE_DIR, spec), path.join(WORK_DIR, spec));
}

console.log('[4/5] writing jest config ...');
const configPath = path.join(WORK_DIR, 'jest.config.cjs');
const tsJestPath = require.resolve('ts-jest', { paths: [REPO_ROOT] });
writeFileSync(
  configPath,
  `module.exports = {
  rootDir: ${JSON.stringify(WORK_DIR)},
  transform: { '^.+\\\\.ts$': ${JSON.stringify(tsJestPath)} },
  testEnvironment: 'node',
  testRegex: '\\\\.spec\\\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  testTimeout: 15000,
  moduleNameMapper: {
    '^vitest$': ${JSON.stringify(path.join(HERE, 'shims', 'vitest.js'))},
    '^\\\\.\\\\./lib/index\\\\.js$': ${JSON.stringify(path.join(HERE, 'shims', 'lib-index.js'))},
    '^\\\\.\\\\./lib/http\\\\.constants\\\\.js$': ${JSON.stringify(path.join(HERE, 'shims', 'http-constants.js'))},
  },
};
`,
);

console.log('[5/5] running jest ...\n');
// Nest 12 / @nestjs/testing are ESM-only; Jest's CJS `require(esm)` support
// needs Node >=24.9 plus this flag (see plan/reports/automation.md item 1).
const jestBin = path.join(REPO_ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
const result = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    '--disable-warning=ExperimentalWarning',
    jestBin,
    '--config',
    configPath,
    '--runInBand',
  ],
  {
    cwd: WORK_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      PROTOTYPE_REPO_LIB: path.join(REPO_ROOT, 'lib', 'index.js'),
      PROTOTYPE_REPO_CONSTANTS: path.join(
        REPO_ROOT,
        'lib',
        'modules',
        'http',
        'constants',
        'http.constants.js',
      ),
    },
  },
);

if (!KEEP) {
  rmSync(WORK_DIR, { recursive: true, force: true });
}

process.exit(result.status ?? 1);
