// Summarize a .cpuprofile: top self-time functions plus inclusive time per package group.
// node topprof.js <file.cpuprofile> [topN]
const fs = require('fs');
const [file, n = 25] = process.argv.slice(2);
const prof = JSON.parse(fs.readFileSync(file));
const byId = new Map(prof.nodes.map((x) => [x.id, x]));
const dt = prof.timeDeltas; let total = 0;
const counts = new Map();
prof.samples.forEach((id, i) => { counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
const self = new Map();
for (const [id, t] of counts) { const cf = byId.get(id).callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.replace(/.*node_modules\//, '').replace(/.*explore-perf\//, '')}:${cf.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + t); }
for (const [k, t] of [...self].sort((a, b) => b[1] - a[1]).slice(0, Number(n))) console.log((100 * t / total).toFixed(1).padStart(5) + '%  ' + k);
const parent = new Map(); for (const nd of prof.nodes) for (const c of nd.children || []) parent.set(c, nd.id);
const groups = {};
for (const [id, t] of counts) { const seen = new Set(); let cur = id; while (cur) { const u = byId.get(cur).callFrame.url; let g = null;
  if (/explore-perf\/[^/]+\/lib\//.test(u)) g = 'library(lib/)'; else if (/node_modules\/undici\//.test(u)) g = 'undici'; else if (/rxjs/.test(u)) g = 'rxjs'; else if (/node_modules\/axios\//.test(u)) g = 'axios'; else if (/follow-redirects|proxy-from-env|form-data/.test(u)) g = 'axios-deps';
  if (g && !seen.has(g)) { seen.add(g); groups[g] = (groups[g] || 0) + t; } cur = parent.get(cur); } }
console.log('inclusive:', Object.entries(groups).map(([g, t]) => `${g} ${(100 * t / total).toFixed(1)}%`).join(', '));
