#!/usr/bin/env node
// Verifies every bare import in the built lib/ (runtime .js AND type-level .d.ts)
// is declared in dependencies or peerDependencies. Usage: node check-deps.js <pkgRoot>
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');
const root = path.resolve(process.argv[2] || '.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]);
const optionalPeers = new Set(Object.entries(pkg.peerDependenciesMeta || {}).filter(([, m]) => m.optional).map(([n]) => n));
const builtins = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));
const pkgName = s => (s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const problems = []; const used = new Map();
for (const file of walk(path.join(root, 'lib'))) {
  if (!/\.(c|m)?js$|\.d\.ts$/.test(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.d.ts') ? 'type' : 'runtime';
  const re = /(?:require\(\s*|from\s+|import\(\s*|import\s+)['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (spec.startsWith('.') || builtins.has(spec) || builtins.has(spec.split('/')[0])) continue;
    const name = pkgName(spec);
    const key = `${name} (${kind})`;
    used.set(key, (used.get(key) || new Set()).add(path.relative(root, file)));
    if (!declared.has(name)) problems.push(`${kind} import '${spec}' in ${path.relative(root, file)} is not a dependency/peer`);
    else if (kind === 'runtime' && optionalPeers.has(name)) problems.push(`runtime import of OPTIONAL peer '${spec}' in ${path.relative(root, file)}`);
  }
}
console.log('Bare imports found:'); for (const [k, v] of [...used].sort()) console.log(`  ${k}: ${v.size} file(s)`);
for (const d of declared) if (![...used.keys()].some(k => k.startsWith(d + ' '))) console.log(`  NOTE: declared but never imported: ${d}`);
if (problems.length) { console.error('\nPROBLEMS:\n  ' + [...new Set(problems)].join('\n  ')); process.exit(1); }
console.log('\nOK: all bare imports are declared.');
