# Benchmarks

> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js 22, 24, 26.

## Summary

- **Undici is 67-70% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).
- **Fastify + Undici is 68-71% faster than the default Express + Axios setup**, with 207-248% more throughput.
- **With interceptors**, Fastify + Undici averages 27-65ms, still faster than every Axios configuration (49-106ms at best).

## Average Response Time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 710 244" width="100%" style="max-width:710px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}@media (prefers-color-scheme:dark){.bench-chart{--ink:#fff;--ink-2:#c3c2b7;--grid:#3a3a37;--undici:#3987e5;--axios:#d95926}}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="230" y="6" width="12" height="12" rx="3"/><text class="label" x="248" y="12" dominant-baseline="central">Undici</text><rect class="axios" x="310" y="6" width="12" height="12" rx="3"/><text class="label" x="328" y="12" dominant-baseline="central">Axios</text></g><line class="grid" x1="230" x2="230" y1="30" y2="220"/><text class="tick" x="230" y="236" text-anchor="middle">0</text><line class="grid" x1="363.3333333333333" x2="363.3333333333333" y1="30" y2="220"/><text class="tick" x="363.3333333333333" y="236" text-anchor="middle">50</text><line class="grid" x1="496.66666666666663" x2="496.66666666666663" y1="30" y2="220"/><text class="tick" x="496.66666666666663" y="236" text-anchor="middle">100</text><line class="grid" x1="630" x2="630" y1="30" y2="220"/><text class="tick" x="630" y="236" text-anchor="middle">150</text><g class="bar"><title>Express + Axios: 106.46 ms average, 185.01 ms p95</title><rect x="0" y="36" width="710" height="30" fill="transparent"/><text class="label" x="220" y="51" text-anchor="end" dominant-baseline="central">Express + Axios</text><path class="axios" d="M230,43h279.89312593269074a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-279.89312593269074z"/><text class="value" x="519.8931259326907" y="51" dominant-baseline="central">106.5 ms</text></g><g class="bar"><title>Fastify + Axios: 108.02 ms average, 188.17 ms p95</title><rect x="0" y="66" width="710" height="30" fill="transparent"/><text class="label" x="220" y="81" text-anchor="end" dominant-baseline="central">Fastify + Axios</text><path class="axios" d="M230,73h284.04533287089816a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-284.04533287089816z"/><text class="value" x="524.0453328708982" y="81" dominant-baseline="central">108.0 ms</text></g><g class="bar"><title>Fastify + Undici: 32.91 ms average, 58.22 ms p95</title><rect x="0" y="96" width="710" height="30" fill="transparent"/><text class="label" x="220" y="111" text-anchor="end" dominant-baseline="central">Fastify + Undici</text><path class="undici" d="M230,103h83.75334287502375a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-83.75334287502375z"/><text class="value" x="323.75334287502375" y="111" dominant-baseline="central">32.9 ms</text></g><g class="bar"><title>Express + Axios + Interceptor: 139.25 ms average, 286.83 ms p95</title><rect x="0" y="126" width="710" height="30" fill="transparent"/><text class="label" x="220" y="141" text-anchor="end" dominant-baseline="central">Express + Axios + Interceptor</text><path class="axios" d="M230,133h367.3234906368318a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-367.3234906368318z"/><text class="value" x="607.3234906368318" y="141" dominant-baseline="central">139.2 ms</text></g><g class="bar"><title>Fastify + Axios + Interceptor: 131.27 ms average, 232.64 ms p95</title><rect x="0" y="156" width="710" height="30" fill="transparent"/><text class="label" x="220" y="171" text-anchor="end" dominant-baseline="central">Fastify + Axios + Interceptor</text><path class="axios" d="M230,163h346.05623905760353a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-346.05623905760353z"/><text class="value" x="586.0562390576035" y="171" dominant-baseline="central">131.3 ms</text></g><g class="bar"><title>Fastify + Undici + Interceptor: 65.38 ms average, 104.06 ms p95</title><rect x="0" y="186" width="710" height="30" fill="transparent"/><text class="label" x="220" y="201" text-anchor="end" dominant-baseline="central">Fastify + Undici + Interceptor</text><path class="undici" d="M230,193h170.34223338459356a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-170.34223338459356z"/><text class="value" x="410.34223338459356" y="201" dominant-baseline="central">65.4 ms</text></g></svg></div>

## Average Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 57.13 | 96.28 | 106.46 |
| Fastify + Axios | 49.25 | 101.91 | 108.02 |
| Fastify + Undici | 16.30 | 31.15 | 32.91 |
| Express + Axios + Interceptor | 69.72 | 130.52 | 139.25 |
| Fastify + Axios + Interceptor | 59.60 | 124.96 | 131.27 |
| Fastify + Undici + Interceptor | 26.97 | 58.97 | 65.38 |

## P95 Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 110.40 | 170.13 | 185.01 |
| Fastify + Axios | 87.91 | 180.75 | 188.17 |
| Fastify + Undici | 28.80 | 54.00 | 58.22 |
| Express + Axios + Interceptor | 127.03 | 233.62 | 286.83 |
| Fastify + Axios + Interceptor | 109.03 | 227.69 | 232.64 |
| Fastify + Undici + Interceptor | 47.27 | 95.06 | 104.06 |

## Throughput (requests/s)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 1122 | 666 | 603 |
| Fastify + Axios | 1302 | 630 | 594 |
| Fastify + Undici | 3905 | 2044 | 1935 |
| Express + Axios + Interceptor | 920 | 492 | 461 |
| Fastify + Axios + Interceptor | 1076 | 513 | 489 |
| Fastify + Undici + Interceptor | 2366 | 1083 | 978 |

## Interceptor Overhead

How much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 22.0% | 35.6% | 30.8% |
| Fastify + Axios | 21.0% | 22.6% | 21.5% |
| Fastify + Undici | 65.4% | 89.3% | 98.7% |

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
- **Library build**: `nestjs-axios-undici@0.6.0 (046f981)`
- **Load**: 0 → 50 → 100 virtual users over 70 seconds per configuration, configurations run one after another
- **Runs**: 2026-09-24

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
