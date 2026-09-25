const fs = require('fs');
const path = require('path');

// Builds results/PERFORMANCE-COMPARISON-REPORT.md from every
// results/node<version>-performance-summary.json that exists.
// `--update-readme` instead refreshes the summary table in README.md.

const RESULTS_DIR = 'results';
const REPORT_PATH = path.join(RESULTS_DIR, 'PERFORMANCE-COMPARISON-REPORT.md');

const CONFIGS = [
  { key: 'express_axios', label: 'Express + Axios' },
  { key: 'fastify_axios', label: 'Fastify + Axios' },
  { key: 'fastify_undici', label: 'Fastify + Undici' },
  { key: 'express_axios_interceptor', label: 'Express + Axios + Interceptor' },
  { key: 'fastify_axios_interceptor', label: 'Fastify + Axios + Interceptor' },
  { key: 'fastify_undici_interceptor', label: 'Fastify + Undici + Interceptor' },
];
const PLAIN = CONFIGS.filter((c) => !c.key.endsWith('_interceptor'));
const INTERCEPTOR_BASES = PLAIN.map((c) => c.key);
const labelOf = (key) => CONFIGS.find((c) => c.key === key)?.label ?? key;

function readJSONFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return null;
  }
}

function loadResults() {
  const files = fs.existsSync(RESULTS_DIR) ? fs.readdirSync(RESULTS_DIR) : [];
  return files
    .map((file) => file.match(/^node(\d+)-performance-summary\.json$/))
    .filter(Boolean)
    .map((match) => ({ version: Number(match[1]), data: readJSONFile(path.join(RESULTS_DIR, match[0])) }))
    .filter((entry) => entry.data?.results)
    .sort((a, b) => a.version - b.version);
}

const num = (value) => (typeof value === 'number' ? value : parseFloat(value));
const isNum = (value) => typeof value === 'number' && !Number.isNaN(value);
const formatNumber = (value, decimals = 2) => (isNum(num(value)) ? num(value).toFixed(decimals) : 'N/A');
const formatPercentage = (value) => (isNum(num(value)) ? `${num(value).toFixed(1)}%` : 'N/A');
const average = (values) => {
  const nums = values.map(num).filter(isNum);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : NaN;
};
const range = (values, decimals = 0, suffix = '') => {
  const nums = values.map(num).filter(isNum);
  if (!nums.length) return 'N/A';
  const fmt = (v) => {
    const text = v.toFixed(decimals);
    return Number(text) === 0 ? (0).toFixed(decimals) : text; // avoid "-0"
  };
  const lo = fmt(Math.min(...nums));
  const hi = fmt(Math.max(...nums));
  if (lo === hi) return `${lo}${suffix}`;
  // "-1 to 15" reads better than "-1-15" when the range crosses zero
  return `${lo}${Number(lo) < 0 ? ' to ' : '-'}${hi}${suffix}`;
};

function indicator(improvement) {
  const value = num(improvement);
  if (!isNum(value)) return '';
  if (value >= 50) return '🟢';
  if (value >= 20) return '🟡';
  return '🔴';
}

function metric(entry, key, field) {
  return entry.data.results[key]?.[field];
}

function rankBy(entry, keys, field) {
  return keys
    .map((key) => ({ key, value: metric(entry, key, field) }))
    .filter((r) => isNum(r.value))
    .sort((a, b) => a.value - b.value);
}

function comparisonValues(runs, name, field = 'avg_response_improvement') {
  return runs.map((r) => r.data.comparison?.[name]?.[field]);
}

// Interceptor overhead: how much slower the average response gets, relative
// to the same configuration without interceptors (positive = slower).
function interceptorOverhead(entry, key) {
  const base = metric(entry, key, 'duration_avg');
  const withInterceptor = metric(entry, `${key}_interceptor`, 'duration_avg');
  return isNum(base) && isNum(withInterceptor) && base > 0 ? ((withInterceptor - base) / base) * 100 : NaN;
}

// "12.3% faster" / "0.1% slower" for a lower-is-better improvement value.
function fasterOrSlower(value) {
  const n = num(value);
  if (!isNum(n)) return 'N/A';
  return n >= 0 ? `${n.toFixed(1)}% faster` : `${(-n).toFixed(1)}% slower`;
}

// Distinct test_info values across runs, e.g. the environment the results came from.
function describeInfo(runs, field) {
  const values = [...new Set(runs.map((r) => r.data.test_info?.[field]).filter((v) => v && v !== 'unspecified'))];
  return values.length ? values.join('; ') : 'not recorded';
}

function packageVersion(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    const pkg = readJSONFile('package.json') || {};
    return pkg.dependencies?.[name] ?? 'N/A';
  }
}

function buildReport(runs) {
  const versions = runs.map((r) => r.version);
  const header = (cells) => `| ${cells.join(' | ')} |\n|${cells.map(() => '---').join('|')}|`;
  const row = (cells) => `| ${cells.join(' | ')} |`;

  const bestOverall = CONFIGS.map((c) => ({
    key: c.key,
    value: average(runs.map((r) => metric(r, c.key, 'duration_avg'))),
  }))
    .filter((c) => isNum(c.value))
    .sort((a, b) => a.value - b.value);
  const fastestUndici = runs
    .map((r) => ({ version: r.version, value: metric(r, 'fastify_undici', 'duration_avg') }))
    .filter((r) => isNum(r.value))
    .sort((a, b) => a.value - b.value)[0];

  const clientImpact = comparisonValues(runs, 'fastify_undici_vs_fastify_axios');
  const combinedImpact = comparisonValues(runs, 'fastify_undici_vs_express_axios');
  const combinedP95 = comparisonValues(runs, 'fastify_undici_vs_express_axios', 'p95_response_improvement');
  const combinedThroughput = comparisonValues(runs, 'fastify_undici_vs_express_axios', 'throughput_improvement');
  const frameworkImpact = comparisonValues(runs, 'fastify_axios_vs_express_axios');
  const errorRates = runs.flatMap((r) => CONFIGS.map((c) => metric(r, c.key, 'error_rate')));
  const maxErrorRate = Math.max(...errorRates.filter(isNum), 0);

  const undiciInterceptorVsAxios = runs.map((r) => {
    const undici = metric(r, 'fastify_undici_interceptor', 'duration_avg');
    const bestAxios = Math.min(
      ...['express_axios', 'fastify_axios'].map((k) => metric(r, k, 'duration_avg')).filter(isNum)
    );
    return isNum(undici) && isFinite(bestAxios) ? ((bestAxios - undici) / bestAxios) * 100 : NaN;
  });

  const lines = [];
  lines.push('# NestJS HTTP Module Performance Comparison Report', '');
  lines.push('## 🎯 Executive Summary', '');
  lines.push(`Node.js versions tested: **${versions.map((v) => `Node ${v}`).join(', ')}**`, '');
  if (bestOverall.length) {
    lines.push(
      `**Best Performer:** ${labelOf(bestOverall[0].key)} averages **${formatNumber(bestOverall[0].value)}ms** across all tested Node.js versions, ` +
        `**${range(combinedImpact)}% faster** than the Express + Axios baseline.`,
      ''
    );
  }
  lines.push('### 🏆 Key Findings', '');
  lines.push(`1. **HTTP client matters most** - Undici is ${range(clientImpact)}% faster than Axios on the same framework (Fastify)`);
  lines.push(`2. **Framework matters less** - Fastify is ${range(frameworkImpact, 1)}% faster than Express with the same client (Axios)`);
  if (fastestUndici) {
    lines.push(
      `3. **Fastest runtime for Undici:** Node.js ${fastestUndici.version} (${formatNumber(fastestUndici.value)}ms average)`
    );
  }
  lines.push(
    `4. **Interceptors keep Undici ahead** - Fastify + Undici with interceptors is ${range(undiciInterceptorVsAxios)}% faster than the best Axios configuration without interceptors`
  );
  lines.push(`5. **Error rate:** ${maxErrorRate === 0 ? '0% across all configurations' : `up to ${(maxErrorRate * 100).toFixed(2)}%`}`, '');
  lines.push('---', '');

  lines.push('## 📊 Performance at a Glance', '');
  lines.push('### Best Configuration by Node.js Version');
  lines.push(header(['Node Version', 'Best Config', 'Avg Response Time', 'Undici vs Baseline']));
  for (const r of runs) {
    const best = rankBy(r, CONFIGS.map((c) => c.key), 'duration_avg')[0];
    const vsBaseline = r.data.comparison?.fastify_undici_vs_express_axios?.avg_response_improvement;
    lines.push(
      row([
        `Node ${r.version}`,
        best ? labelOf(best.key) : 'N/A',
        best ? `${formatNumber(best.value)}ms` : 'N/A',
        `${formatPercentage(vsBaseline)} ${indicator(vsBaseline)}`.trim(),
      ])
    );
  }
  lines.push('');

  lines.push('### Rankings (average across Node.js versions)');
  lines.push(header(['Rank', 'Configuration', 'Avg Response', 'P95', 'Throughput (req/s)']));
  bestOverall.forEach((c, i) => {
    lines.push(
      row([
        String(i + 1),
        labelOf(c.key),
        `${formatNumber(c.value)}ms`,
        `${formatNumber(average(runs.map((r) => metric(r, c.key, 'duration_p95'))))}ms`,
        formatNumber(average(runs.map((r) => metric(r, c.key, 'rps'))), 0),
      ])
    );
  });
  lines.push('', '---', '');

  lines.push('## 🔍 Key Performance Metrics', '');
  lines.push('### Fastify + Undici vs Express + Axios');
  lines.push(`- **Average Response Time:** ${range(combinedImpact)}% faster`);
  lines.push(`- **P95 Response Time:** ${range(combinedP95)}% faster`);
  lines.push(`- **Throughput:** ${range(combinedThroughput)}% higher`, '');

  lines.push('### Improvements by Node.js Version (average response time)');
  lines.push(header(['Comparison', ...versions.map((v) => `Node ${v}`)]));
  for (const [name, label] of [
    ['fastify_axios_vs_express_axios', 'Fastify+Axios vs Express+Axios'],
    ['fastify_undici_vs_express_axios', 'Fastify+Undici vs Express+Axios'],
    ['fastify_undici_vs_fastify_axios', 'Fastify+Undici vs Fastify+Axios'],
  ]) {
    lines.push(row([label, ...comparisonValues(runs, name).map(formatPercentage)]));
  }
  lines.push('', '---', '');

  lines.push('## 🔄 Interceptor Performance Impact', '');
  lines.push('Overhead = how much slower the average response gets when interceptors are added.', '');
  lines.push(header(['Configuration', ...versions.map((v) => `Node ${v}`), 'Average']));
  for (const key of INTERCEPTOR_BASES) {
    const values = runs.map((r) => interceptorOverhead(r, key));
    lines.push(row([labelOf(key), ...values.map(formatPercentage), formatPercentage(average(values))]));
  }
  lines.push('');
  lines.push(
    '> **Note:** the Undici interceptor app uses the `nestjs-axios-undici` fork, which returns axios-compatible responses ' +
      '(body read and parsed for you), while the plain Undici app uses `nestjs-undici` and parses `body.json()` itself. ' +
      'The Undici "overhead" therefore includes the fork\'s response adaptation, not only the interceptor.',
    ''
  );
  lines.push('---', '');

  lines.push('## 📋 Detailed Results', '');
  const matrix = (title, field, decimals, suffix) => {
    lines.push(`### ${title}`);
    lines.push(header(['Node Version', ...CONFIGS.map((c) => c.label)]));
    for (const r of runs) {
      lines.push(row([`Node ${r.version}`, ...CONFIGS.map((c) => `${formatNumber(metric(r, c.key, field), decimals)}${suffix}`)]));
    }
    lines.push('');
  };
  matrix('Average Response Time', 'duration_avg', 2, 'ms');
  matrix('Median Response Time', 'duration_med', 2, 'ms');
  matrix('P95 Response Time', 'duration_p95', 2, 'ms');
  matrix('P99 Response Time', 'duration_p99', 2, 'ms');
  matrix('Throughput (req/s)', 'rps', 0, '');
  lines.push('---', '');

  lines.push('## 🛠️ Test Configuration', '');
  lines.push('- **Load Pattern**: 0 → 50 → 100 virtual users over 70 seconds per configuration');
  lines.push('- **Workload**: each request triggers 5 parallel HTTP calls to a mock service');
  lines.push(`- **Environment**: ${describeInfo(runs, 'environment')}`);
  lines.push(`- **Library build**: ${describeInfo(runs, 'library_ref')}`);
  lines.push('- **Test Tool**: k6');
  lines.push(
    `- **Packages**: nestjs-undici ${packageVersion('nestjs-undici')}, nestjs-axios-undici ${packageVersion('nestjs-axios-undici')}, ` +
      `undici ${packageVersion('undici')}, @nestjs/axios ${packageVersion('@nestjs/axios')}, axios ${packageVersion('axios')}, @nestjs/core ${packageVersion('@nestjs/core')}`
  );
  const timestamps = runs.map((r) => r.data.test_info?.timestamp).filter(Boolean).sort();
  lines.push(`- **Test Runs**: ${timestamps.length ? timestamps.map((t) => t.split('T')[0]).filter((d, i, a) => a.indexOf(d) === i).join(', ') : 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

function readmeBlocks(runs) {
  const versions = runs.map((r) => r.version).join(', ');
  const avg = (key) => range(runs.map((r) => metric(r, key, 'duration_avg')), 0, 'ms');
  const vsBaseline = (name) => range(comparisonValues(runs, name), 0, '% faster');
  const throughput = (name) => {
    const values = comparisonValues(runs, name, 'throughput_improvement').map((v) => 100 + num(v));
    return range(values, 0, '%');
  };
  const clientImpact = range(comparisonValues(runs, 'fastify_undici_vs_fastify_axios'));

  const summary = [
    `> **TL;DR: Undici is ${clientImpact}% faster than Axios across Node.js ${versions}**`,
    '',
    '### Latest Benchmark Results',
    '',
    '| Configuration | Avg Response Time | vs Baseline | Throughput |',
    '|--------------|-------------------|-------------|------------|',
    `| **Express + Axios** | ${avg('express_axios')} | baseline | 100% |`,
    `| **Fastify + Axios** | ${avg('fastify_axios')} | ${vsBaseline('fastify_axios_vs_express_axios')} | ${throughput('fastify_axios_vs_express_axios')} |`,
    `| **Fastify + Undici** | **${avg('fastify_undici')}** | **${vsBaseline('fastify_undici_vs_express_axios')}** | **${throughput('fastify_undici_vs_express_axios')}** |`,
    '',
    `*Results from Node.js ${versions}. [View detailed results](#-latest-performance-results) | [View full report](results/PERFORMANCE-COMPARISON-REPORT.md)*`,
  ];
  summary.push('', `*Environment: ${describeInfo(runs, 'environment')}*`);

  const details = [
    `With 5 parallel HTTP requests per endpoint call, tested across Node.js ${versions}:`,
    '',
    '| Node Version | Configuration | Avg Response (ms) | P95 (ms) | P99 (ms) | vs Express+Axios |',
    '|--------------|---------------|-------------------|----------|----------|------------------|',
  ];
  for (const r of runs) {
    for (const c of PLAIN) {
      const improvement =
        c.key === 'express_axios'
          ? 'baseline'
          : fasterOrSlower(r.data.comparison?.[`${c.key}_vs_express_axios`]?.avg_response_improvement);
      details.push(
        `| **Node ${r.version}** | ${c.label} | ${formatNumber(metric(r, c.key, 'duration_avg'))} | ${formatNumber(metric(r, c.key, 'duration_p95'))} | ${formatNumber(metric(r, c.key, 'duration_p99'))} | ${c.key === 'fastify_undici' ? `**${improvement}**` : improvement} |`
      );
    }
  }
  details.push('', '#### With Interceptors', '');
  details.push('| Node Version | Express + Axios | Fastify + Axios | Fastify + Undici |');
  details.push('|--------------|-----------------|-----------------|------------------|');
  for (const r of runs) {
    const cell = (key) => {
      const overhead = interceptorOverhead(r, key);
      return `${formatNumber(metric(r, `${key}_interceptor`, 'duration_avg'))}ms (${overhead >= 0 ? '+' : ''}${formatPercentage(overhead)})`;
    };
    details.push(`| **Node ${r.version}** | ${cell('express_axios')} | ${cell('fastify_axios')} | ${cell('fastify_undici')} |`);
  }
  const fastest = runs
    .map((r) => ({ version: r.version, value: metric(r, 'fastify_undici', 'duration_avg') }))
    .filter((r) => isNum(r.value))
    .sort((a, b) => a.value - b.value)[0];
  details.push('', '### Key Findings', '');
  details.push(`- **Undici is ${clientImpact}% faster than Axios** on the same framework (Fastify) across all tested Node.js versions`);
  details.push(`- **Framework impact is smaller**: Fastify is ${range(comparisonValues(runs, 'fastify_axios_vs_express_axios'), 1)}% faster than Express with Axios`);
  details.push(`- **Best configuration**: Fastify + Undici at ${avg('fastify_undici')} average${fastest ? `, fastest on Node.js ${fastest.version} (${formatNumber(fastest.value)}ms)` : ''}`);
  details.push(`- **Throughput**: Fastify + Undici delivers ${range(comparisonValues(runs, 'fastify_undici_vs_express_axios', 'throughput_improvement'))}% more requests/s than Express + Axios`);
  details.push(`- **Interceptors**: Fastify + Undici with interceptors averages ${avg('fastify_undici_interceptor')}, still well ahead of every Axios configuration`);

  return { 'perf-summary': summary.join('\n'), 'perf-details': details.join('\n') };
}

function updateReadme(runs) {
  let readme = fs.readFileSync('README.md', 'utf8');
  for (const [name, content] of Object.entries(readmeBlocks(runs))) {
    const start = `<!-- ${name}:start -->`;
    const end = `<!-- ${name}:end -->`;
    const from = readme.indexOf(start);
    const to = readme.indexOf(end);
    if (from === -1 || to === -1) {
      console.error(`README.md is missing the ${name} markers; block not updated`);
      process.exitCode = 1;
      continue;
    }
    readme = readme.slice(0, from + start.length) + '\n' + content + '\n' + readme.slice(to);
  }
  fs.writeFileSync('README.md', readme);
  console.log('README.md results updated');
}

// ---------------------------------------------------------------------------
// Documentation site page (docs/benchmarks.md)

const escapeXml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function niceStep(max, target = 5) {
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((step) => step >= raw);
}

// Horizontal bars of average latency for one Node.js version, colored by HTTP client.
function latencyChart(run) {
  const bars = CONFIGS.map((c) => ({
    label: c.label,
    value: metric(run, c.key, 'duration_avg'),
    p95: metric(run, c.key, 'duration_p95'),
    client: c.key.includes('undici') ? 'undici' : 'axios',
  })).filter((b) => isNum(b.value));
  const labelWidth = 230;
  const plotWidth = 400;
  const rowHeight = 30;
  const barHeight = 16;
  const top = 36;
  const width = labelWidth + plotWidth + 80;
  const height = top + bars.length * rowHeight + 28;
  const step = niceStep(Math.max(...bars.map((b) => b.value)));
  const axisMax = Math.ceil(Math.max(...bars.map((b) => b.value)) / step) * step;
  const x = (v) => labelWidth + (v / axisMax) * plotWidth;

  const ticks = [];
  for (let v = 0; v <= axisMax + 1e-9; v += step) {
    ticks.push(
      `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top - 6}" y2="${height - 24}"/>` +
        `<text class="tick" x="${x(v)}" y="${height - 8}" text-anchor="middle">${+v.toFixed(2)}</text>`
    );
  }
  const r = 4;
  const rows = bars.map((b, i) => {
    const y = top + i * rowHeight + (rowHeight - barHeight) / 2;
    const w = Math.max(x(b.value) - labelWidth, r);
    const x0 = labelWidth;
    // Square at the baseline, 4px rounded data end.
    const d = `M${x0},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${barHeight - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - r}z`;
    return (
      `<g class="bar"><title>${escapeXml(`${b.label}: ${formatNumber(b.value)} ms average, ${formatNumber(b.p95)} ms p95`)}</title>` +
      `<rect x="0" y="${top + i * rowHeight}" width="${width}" height="${rowHeight}" fill="transparent"/>` +
      `<text class="label" x="${labelWidth - 10}" y="${y + barHeight / 2}" text-anchor="end" dominant-baseline="central">${escapeXml(b.label)}</text>` +
      `<path class="${b.client}" d="${d}"/>` +
      `<text class="value" x="${x(b.value) + 6}" y="${y + barHeight / 2}" dominant-baseline="central">${formatNumber(b.value, 1)} ms</text></g>`
    );
  });
  const legend =
    `<g class="legend"><rect class="undici" x="${labelWidth}" y="6" width="12" height="12" rx="3"/>` +
    `<text class="label" x="${labelWidth + 18}" y="12" dominant-baseline="central">Undici</text>` +
    `<rect class="axios" x="${labelWidth + 80}" y="6" width="12" height="12" rx="3"/>` +
    `<text class="label" x="${labelWidth + 98}" y="12" dominant-baseline="central">Axios</text></g>`;

  return [
    // Scroll inside its own box on narrow screens rather than shrinking the text.
    '<div style="overflow-x:auto">',
    `<svg class="bench-chart" viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js ${run.version}, lower is better">`,
    // The docsify site uses a light theme only, so the chart uses the light palette
    // regardless of the OS colour scheme (a dark-mode override made the text white
    // on the white page).
    '<style>',
    '.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}',
    '.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}',
    '.bench-chart .bar:hover path{opacity:.85}',
    '</style>',
    legend,
    ...ticks,
    ...rows,
    '</svg>',
    '</div>',
  ].join('');
}

function buildDocsPage(runs) {
  const latest = runs[runs.length - 1];
  const versions = runs.map((r) => r.version).join(', ');
  const clientImpact = range(comparisonValues(runs, 'fastify_undici_vs_fastify_axios'));
  const combined = range(comparisonValues(runs, 'fastify_undici_vs_express_axios'));
  const throughput = range(comparisonValues(runs, 'fastify_undici_vs_express_axios', 'throughput_improvement'));
  const header = (cells) => `| ${cells.join(' | ')} |\n|${cells.map((_, i) => (i ? '---:' : '---')).join('|')}|`;
  const row = (cells) => `| ${cells.join(' | ')} |`;
  const matrix = (field, decimals, suffix) => [
    header(['Configuration', ...runs.map((r) => `Node ${r.version}`)]),
    ...CONFIGS.map((c) => row([c.label, ...runs.map((r) => `${formatNumber(metric(r, c.key, field), decimals)}${suffix}`)])),
  ].join('\n');

  return [
    '# Benchmarks',
    '',
    '> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.',
    '',
    `Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js ${versions}.`,
    '',
    '## Summary',
    '',
    `- **Undici is ${clientImpact}% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).`,
    `- **Fastify + Undici is ${combined}% faster than the default Express + Axios setup**, with ${throughput}% more throughput.`,
    `- **With interceptors**, Fastify + Undici averages ${range(runs.map((r) => metric(r, 'fastify_undici_interceptor', 'duration_avg')), 0, 'ms')}, still faster than every Axios configuration (${range(runs.map((r) => Math.min(...['express_axios', 'fastify_axios'].map((k) => metric(r, k, 'duration_avg')))), 0, 'ms')} at best).`,
    '',
    `## Average Response Time on Node.js ${latest.version}`,
    '',
    'Lower is better. Hover a bar for its p95.',
    '',
    latencyChart(latest),
    '',
    '## Average Response Time (ms)',
    '',
    matrix('duration_avg', 2, ''),
    '',
    '## P95 Response Time (ms)',
    '',
    matrix('duration_p95', 2, ''),
    '',
    '## Throughput (requests/s)',
    '',
    matrix('rps', 0, ''),
    '',
    '## Interceptor Overhead',
    '',
    'How much slower the average response gets when interceptors are added.',
    '',
    header(['Configuration', ...runs.map((r) => `Node ${r.version}`)]),
    ...INTERCEPTOR_BASES.map((key) => row([labelOf(key), ...runs.map((r) => formatPercentage(interceptorOverhead(r, key)))])),
    '',
    '> The Undici interceptor app uses `nestjs-axios-undici`, which returns axios-compatible responses (body read and parsed), while the plain Undici app uses upstream `nestjs-undici` and returns the raw body stream. Its overhead therefore includes the axios-compatible response adaptation, not only the interceptors.',
    '',
    '## Configurations',
    '',
    '| Configuration | Server | HTTP client |',
    '|---|---|---|',
    '| Express + Axios | Express | `@nestjs/axios` |',
    '| Fastify + Axios | Fastify | `@nestjs/axios` |',
    '| Fastify + Undici | Fastify | `nestjs-undici` (upstream) |',
    '| Express/Fastify + Axios + Interceptor | Express/Fastify | `@nestjs/axios` with request/response interceptors |',
    '| Fastify + Undici + Interceptor | Fastify | `nestjs-axios-undici` (this repository) with a logging interceptor |',
    '',
    '## Environment',
    '',
    `- **Where**: ${describeInfo(runs, 'environment')}`,
    `- **Library build**: \`${describeInfo(runs, 'library_ref')}\``,
    `- **Load**: 0 → 50 → 100 virtual users over 70 seconds per configuration, configurations run one after another`,
    `- **Runs**: ${[...new Set(runs.map((r) => r.data.test_info?.timestamp?.split('T')[0]).filter(Boolean))].join(', ')}`,
    '',
    'Absolute latencies depend on the machine; compare configurations within a run.',
    '',
    '## Regression Checks',
    '',
    'Every pull request that touches `src/` runs an `HttpService` micro-benchmark against the base branch on the same runner and fails if throughput drops by more than 10%. See [`benchmarks/micro`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/micro).',
    '',
    '## Running the Benchmarks',
    '',
    '```bash',
    'cd benchmarks',
    './scripts/pack-lib.sh          # build and pack the library from this checkout',
    'npm ci && npm run install-lib  # install benchmark deps + the packed library',
    './test-all-node-versions.sh    # Docker + k6 across Node.js 22, 24 and 26',
    'node generate-comparison-report.js --docs ../docs/benchmarks.md',
    '```',
    '',
  ].join('\n');
}

const runs = loadResults();
if (runs.length === 0) {
  console.error(`No results/node<version>-performance-summary.json files found in ${RESULTS_DIR}/`);
  process.exit(1);
}

const docsIndex = process.argv.indexOf('--docs');
if (docsIndex !== -1) {
  const target = process.argv[docsIndex + 1] || '../docs/benchmarks.md';
  fs.writeFileSync(target, buildDocsPage(runs));
  console.log(`Docs page written to ${target}`);
} else if (process.argv.includes('--update-readme')) {
  updateReadme(runs);
} else {
  fs.writeFileSync(REPORT_PATH, buildReport(runs));
  console.log(`Report written to ${REPORT_PATH} (Node.js ${runs.map((r) => r.version).join(', ')})`);
}
