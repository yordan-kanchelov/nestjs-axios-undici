#!/usr/bin/env node
'use strict';
// Fails when the built package imports a module a consumer won't have: every bare import
// in lib/, at runtime (.js) and in the type declarations (.d.ts), must be a dependency or
// a peerDependency. Node builtins are allowed, and so is `/// <reference types="node" />`.
// Catches bugs like 0.6.0 requiring @nestjs/core without declaring it.
//
// Usage: node scripts/consumer/check-declared-deps.cjs [<package dir> | <file.tgz>]
// Imports are read with TypeScript's preprocessor, which ignores comments and strings.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { builtinModules } = require('node:module');
const ts = require('typescript');

const target = path.resolve(process.argv[2] || '.');
const root = fs.statSync(target).isDirectory() ? target : extract(target);
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const libDir = path.join(root, 'lib');
if (!fs.existsSync(libDir)) {
  console.error(`${libDir} does not exist, build the package first`);
  process.exit(1);
}

const declared = new Set([
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
]);
const optionalPeers = new Set(
  Object.entries(pkg.peerDependenciesMeta || {})
    .filter(([, meta]) => meta.optional)
    .map(([name]) => name),
);
const builtins = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));
const isBuiltin = spec =>
  spec.startsWith('node:') ||
  builtins.has(spec) ||
  builtins.has(spec.split('/')[0]);

const problems = [];
const used = new Map(); // "name (kind)" -> Set of files
for (const file of walk(libDir)) {
  const isTypes = /\.d\.[cm]?ts$/.test(file);
  if (!isTypes && !/\.[cm]?js$/.test(file)) continue;
  const kind = isTypes ? 'type' : 'runtime';
  const rel = path.relative(root, file);
  const info = ts.preProcessFile(fs.readFileSync(file, 'utf8'), true, true);
  const specs = info.importedFiles.map(f => f.fileName);
  for (const ref of info.typeReferenceDirectives) {
    // `/// <reference types="node" />` means @types/node, which Node consumers have
    if (ref.fileName !== 'node') specs.push(ref.fileName);
  }
  for (const spec of specs) {
    if (spec.startsWith('.') || path.isAbsolute(spec) || isBuiltin(spec)) {
      continue;
    }
    const name = packageName(spec);
    const key = `${name} (${kind})`;
    used.set(key, (used.get(key) || new Set()).add(rel));
    if (name === pkg.name) continue;
    if (!declared.has(name)) {
      const hint = pkg.devDependencies?.[name] ? ' (only a devDependency)' : '';
      problems.push(
        `${kind} import '${spec}' in ${rel} is not a dependency or peerDependency${hint}`,
      );
    } else if (kind === 'runtime' && optionalPeers.has(name)) {
      problems.push(`runtime import of optional peer '${spec}' in ${rel}`);
    }
  }
}

console.log(`Bare imports in ${pkg.name}@${pkg.version} lib/:`);
for (const [key, files] of [...used].sort()) {
  console.log(`  ${key}: ${files.size} file(s)`);
}
for (const name of declared) {
  if (![...used.keys()].some(key => key.startsWith(`${name} `))) {
    console.log(`  note: ${name} is declared but never imported`);
  }
}
if (problems.length) {
  console.error(
    `\nUndeclared imports:\n  ${[...new Set(problems)].join('\n  ')}`,
  );
  process.exit(1);
}
console.log('\nOK: every bare import is declared.');

function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function extract(tarball) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-deps-'));
  execFileSync('tar', ['-xzf', tarball, '-C', dir]);
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'package');
}
