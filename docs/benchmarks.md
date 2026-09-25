# Benchmarks

> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js 22, 24, 26.

## Summary

- **Undici is 67-70% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).
- **Fastify + Undici is 68-71% faster than the default Express + Axios setup**, with 211-248% more throughput.
- **With interceptors**, Fastify + Undici averages 27-64ms, still faster than every Axios configuration (50-113ms at best).

## Average Response Time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 710 244" width="100%" style="max-width:710px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="230" y="6" width="12" height="12" rx="3"/><text class="label" x="248" y="12" dominant-baseline="central">Undici</text><rect class="axios" x="310" y="6" width="12" height="12" rx="3"/><text class="label" x="328" y="12" dominant-baseline="central">Axios</text></g><line class="grid" x1="230" x2="230" y1="30" y2="220"/><text class="tick" x="230" y="236" text-anchor="middle">0</text><line class="grid" x1="363.3333333333333" x2="363.3333333333333" y1="30" y2="220"/><text class="tick" x="363.3333333333333" y="236" text-anchor="middle">50</text><line class="grid" x1="496.66666666666663" x2="496.66666666666663" y1="30" y2="220"/><text class="tick" x="496.66666666666663" y="236" text-anchor="middle">100</text><line class="grid" x1="630" x2="630" y1="30" y2="220"/><text class="tick" x="630" y="236" text-anchor="middle">150</text><g class="bar"><title>Express + Axios: 113.45 ms average, 193.45 ms p95</title><rect x="0" y="36" width="710" height="30" fill="transparent"/><text class="label" x="220" y="51" text-anchor="end" dominant-baseline="central">Express + Axios</text><path class="axios" d="M230,43h298.53859956188387a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-298.53859956188387z"/><text class="value" x="538.5385995618839" y="51" dominant-baseline="central">113.5 ms</text></g><g class="bar"><title>Fastify + Axios: 113.72 ms average, 194.89 ms p95</title><rect x="0" y="66" width="710" height="30" fill="transparent"/><text class="label" x="220" y="81" text-anchor="end" dominant-baseline="central">Fastify + Axios</text><path class="axios" d="M230,73h299.2403931530929a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-299.2403931530929z"/><text class="value" x="539.2403931530929" y="81" dominant-baseline="central">113.7 ms</text></g><g class="bar"><title>Fastify + Undici: 35.17 ms average, 60.32 ms p95</title><rect x="0" y="96" width="710" height="30" fill="transparent"/><text class="label" x="220" y="111" text-anchor="end" dominant-baseline="central">Fastify + Undici</text><path class="undici" d="M230,103h89.78810538979116a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-89.78810538979116z"/><text class="value" x="329.78810538979116" y="111" dominant-baseline="central">35.2 ms</text></g><g class="bar"><title>Express + Axios + Interceptor: 143.54 ms average, 311.57 ms p95</title><rect x="0" y="126" width="710" height="30" fill="transparent"/><text class="label" x="220" y="141" text-anchor="end" dominant-baseline="central">Express + Axios + Interceptor</text><path class="axios" d="M230,133h378.76619467407625a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-378.76619467407625z"/><text class="value" x="618.7661946740762" y="141" dominant-baseline="central">143.5 ms</text></g><g class="bar"><title>Fastify + Axios + Interceptor: 137.32 ms average, 242.16 ms p95</title><rect x="0" y="156" width="710" height="30" fill="transparent"/><text class="label" x="220" y="171" text-anchor="end" dominant-baseline="central">Fastify + Axios + Interceptor</text><path class="axios" d="M230,163h362.1900879491367a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-362.1900879491367z"/><text class="value" x="602.1900879491367" y="171" dominant-baseline="central">137.3 ms</text></g><g class="bar"><title>Fastify + Undici + Interceptor: 63.50 ms average, 101.58 ms p95</title><rect x="0" y="186" width="710" height="30" fill="transparent"/><text class="label" x="220" y="201" text-anchor="end" dominant-baseline="central">Fastify + Undici + Interceptor</text><path class="undici" d="M230,193h165.33464913557714a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-165.33464913557714z"/><text class="value" x="405.33464913557714" y="201" dominant-baseline="central">63.5 ms</text></g></svg></div>

## Average Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 58.35 | 78.98 | 113.45 |
| Fastify + Axios | 49.78 | 83.32 | 113.72 |
| Fastify + Undici | 16.64 | 25.24 | 35.17 |
| Express + Axios + Interceptor | 71.27 | 106.40 | 143.54 |
| Fastify + Axios + Interceptor | 60.47 | 127.72 | 137.32 |
| Fastify + Undici + Interceptor | 26.65 | 62.60 | 63.50 |

## P95 Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 135.24 | 141.91 | 193.45 |
| Fastify + Axios | 89.34 | 166.21 | 194.89 |
| Fastify + Undici | 28.90 | 43.46 | 60.32 |
| Express + Axios + Interceptor | 132.46 | 214.10 | 311.57 |
| Fastify + Axios + Interceptor | 110.25 | 222.73 | 242.16 |
| Fastify + Undici + Interceptor | 46.96 | 102.09 | 101.58 |

## Throughput (requests/s)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 1100 | 812 | 566 |
| Fastify + Axios | 1288 | 770 | 564 |
| Fastify + Undici | 3826 | 2523 | 1811 |
| Express + Axios + Interceptor | 900 | 603 | 447 |
| Fastify + Axios + Interceptor | 1060 | 502 | 467 |
| Fastify + Undici + Interceptor | 2395 | 1020 | 1006 |

## Interceptor Overhead

How much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 22.1% | 34.7% | 26.5% |
| Fastify + Axios | 21.5% | 53.3% | 20.8% |
| Fastify + Undici | 60.2% | 148.0% | 80.6% |

> The Undici interceptor app uses `nestjs-axios-undici`, which returns axios-compatible responses (body read and parsed), while the plain Undici app uses upstream `nestjs-undici` and returns the raw body stream. Its overhead therefore includes the axios-compatible response adaptation, not only the interceptors.

## Configurations

| Configuration | Server | HTTP client |
|---|---|---|
| Express + Axios | Express | `@nestjs/axios` |
| Fastify + Axios | Fastify | `@nestjs/axios` |
| Fastify + Undici | Fastify | `nestjs-undici` (upstream) |
| Express/Fastify + Axios + Interceptor | Express/Fastify | `@nestjs/axios` with request/response interceptors |
| Fastify + Undici + Interceptor | Fastify | `nestjs-axios-undici` (this repository) with a logging interceptor |

## Environment

- **Where**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: `nestjs-axios-undici@0.6.1 (3c9fcf1)`
- **Load**: 0 → 50 → 100 virtual users over 70 seconds per configuration, configurations run one after another
- **Runs**: 2026-09-25

Absolute latencies depend on the machine; compare configurations within a run.

## Regression Checks

Every pull request that touches `src/` runs an `HttpService` micro-benchmark against the base branch on the same runner and fails if throughput drops by more than 10%. See [`benchmarks/micro`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/micro).

## Running the Benchmarks

```bash
cd benchmarks
./scripts/pack-lib.sh          # build and pack the library from this checkout
npm ci && npm run install-lib  # install benchmark deps + the packed library
./test-all-node-versions.sh    # Docker + k6 across Node.js 22, 24 and 26
node generate-comparison-report.js --docs ../docs/benchmarks.md
```
