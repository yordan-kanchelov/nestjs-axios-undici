// Fails if the built lib requires a bare module that is not a dependency/peerDependency
// (the class of bug where @nestjs/core was imported but not declared). Usage: node check-declared-deps.cjs <pkgdir>
const fs = require('node:fs'), path = require('node:path'), { builtinModules } = require('node:module');
const dir = path.resolve(process.argv[2] || '.');
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})]);
const bad = [];
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (/\.(c|m)?js$/.test(e.name)) {
    const src = fs.readFileSync(p, 'utf8');
    for (const [, spec] of src.matchAll(/(?:require\(|import\(|from\s+)['"]([^'".][^'"]*)['"]/g)) {
      if (spec.startsWith('node:') || builtinModules.includes(spec.split('/')[0])) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!declared.has(name)) bad.push(`${path.relative(dir, p)}: ${spec}`);
    }
  } } };
walk(path.join(dir, 'lib'));
if (bad.length) { console.error('Undeclared runtime imports:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('all runtime imports are declared');
