#!/usr/bin/env node
// Installs the library tarball built by scripts/pack-lib.sh into
// node_modules/nestjs-axios-undici.
//
// The library is deliberately not a package.json/lockfile dependency: npm
// caches `file:` tarballs by the integrity hash in the lockfile, so after a
// source change `npm ci` would silently reinstall the old build. Run this
// after every `npm ci` / `npm install` (npm prunes packages it doesn't know).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tarball = path.join(root, '.lib', 'nestjs-axios-undici.tgz');
const target = path.join(root, 'node_modules', 'nestjs-axios-undici');

if (!fs.existsSync(tarball)) {
  console.error(`Missing ${path.relative(root, tarball)} - run scripts/pack-lib.sh first`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', target]);

// The library's runtime dependencies must come from the benchmarks lockfile.
const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
// (Look the directories up directly: some packages don't export package.json.)
const lookupDirs = require.resolve.paths('x').filter((dir) => dir.startsWith(root));
const missing = Object.keys(pkg.dependencies || {}).filter(
  (dep) => !lookupDirs.some((dir) => fs.existsSync(path.join(dir, dep, 'package.json')))
);
if (missing.length) {
  console.error(`Library dependencies missing from benchmarks/package.json: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Installed nestjs-axios-undici ${pkg.version} from .lib/`);
