// Lists every symbol exported from the package entry .d.ts with its kind and source file.
// Usage: node list-exports.js <path/to/lib/index.d.ts>  (resolves typescript from cwd)
const ts = require(require.resolve('typescript', { paths: [process.cwd()] }));
const path = require('path');
const entry = path.resolve(process.argv[2]);
const program = ts.createProgram([entry], { skipLibCheck: true, types: [] });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(entry);
const modSym = checker.getSymbolAtLocation(sf);
const F = ts.SymbolFlags;
const kind = s => s.flags & F.Class ? 'class' : s.flags & F.Function ? 'function' : s.flags & F.Interface ? 'interface' : s.flags & F.TypeAlias ? 'type' : s.flags & F.Variable ? 'const' : s.flags & F.Enum ? 'enum' : String(s.flags);
const rows = checker.getExportsOfModule(modSym).map(s => {
  const t = s.flags & F.Alias ? checker.getAliasedSymbol(s) : s;
  const d = t.declarations?.[0];
  return [s.name, kind(t), d ? path.relative(path.dirname(entry), d.getSourceFile().fileName) : '?'];
}).sort((a, b) => a[2].localeCompare(b[2]) || a[0].localeCompare(b[0]));
for (const r of rows) console.log(r.join('\t'));
console.error(`total: ${rows.length}`);
