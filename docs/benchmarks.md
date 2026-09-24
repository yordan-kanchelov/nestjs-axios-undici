# Benchmarks

> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js 20, 22, 24, 26.

## Summary

- **Undici is 66-71% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).
- **Fastify + Undici is 69-70% faster than the default Express + Axios setup**, with 219-236% more throughput.
- **With interceptors**, Fastify + Undici averages 61-89ms, still faster than every Axios configuration (96-127ms at best).

## Average Response Time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 710 244" width="100%" style="max-width:710px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}@media (prefers-color-scheme:dark){.bench-chart{--ink:#fff;--ink-2:#c3c2b7;--grid:#3a3a37;--undici:#3987e5;--axios:#d95926}}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="230" y="6" width="12" height="12" rx="3"/><text class="label" x="248" y="12" dominant-baseline="central">Undici</text><rect class="axios" x="310" y="6" width="12" height="12" rx="3"/><text class="label" x="328" y="12" dominant-baseline="central">Axios</text></g><line class="grid" x1="230" x2="230" y1="30" y2="220"/><text class="tick" x="230" y="236" text-anchor="middle">0</text><line class="grid" x1="363.3333333333333" x2="363.3333333333333" y1="30" y2="220"/><text class="tick" x="363.3333333333333" y="236" text-anchor="middle">50</text><line class="grid" x1="496.66666666666663" x2="496.66666666666663" y1="30" y2="220"/><text class="tick" x="496.66666666666663" y="236" text-anchor="middle">100</text><line class="grid" x1="630" x2="630" y1="30" y2="220"/><text class="tick" x="630" y="236" text-anchor="middle">150</text><g class="bar"><title>Express + Axios: 95.81 ms average, 167.82 ms p95</title><rect x="0" y="36" width="710" height="30" fill="transparent"/><text class="label" x="220" y="51" text-anchor="end" dominant-baseline="central">Express + Axios</text><path class="axios" d="M230,43h251.48127502829772a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-251.48127502829772z"/><text class="value" x="491.4812750282977" y="51" dominant-baseline="central">95.8 ms</text></g><g class="bar"><title>Fastify + Axios: 96.45 ms average, 170.22 ms p95</title><rect x="0" y="66" width="710" height="30" fill="transparent"/><text class="label" x="220" y="81" text-anchor="end" dominant-baseline="central">Fastify + Axios</text><path class="axios" d="M230,73h253.2110027692724a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-253.2110027692724z"/><text class="value" x="493.2110027692724" y="81" dominant-baseline="central">96.5 ms</text></g><g class="bar"><title>Fastify + Undici: 28.28 ms average, 49.10 ms p95</title><rect x="0" y="96" width="710" height="30" fill="transparent"/><text class="label" x="220" y="111" text-anchor="end" dominant-baseline="central">Fastify + Undici</text><path class="undici" d="M230,103h71.40404335777424a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-71.40404335777424z"/><text class="value" x="311.40404335777424" y="111" dominant-baseline="central">28.3 ms</text></g><g class="bar"><title>Express + Axios + Interceptor: 126.98 ms average, 260.66 ms p95</title><rect x="0" y="126" width="710" height="30" fill="transparent"/><text class="label" x="220" y="141" text-anchor="end" dominant-baseline="central">Express + Axios + Interceptor</text><path class="axios" d="M230,133h334.6205007215433a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-334.6205007215433z"/><text class="value" x="574.6205007215433" y="141" dominant-baseline="central">127.0 ms</text></g><g class="bar"><title>Fastify + Axios + Interceptor: 115.90 ms average, 204.64 ms p95</title><rect x="0" y="156" width="710" height="30" fill="transparent"/><text class="label" x="220" y="171" text-anchor="end" dominant-baseline="central">Fastify + Axios + Interceptor</text><path class="axios" d="M230,163h305.0769976060917a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-305.0769976060917z"/><text class="value" x="545.0769976060917" y="171" dominant-baseline="central">115.9 ms</text></g><g class="bar"><title>Fastify + Undici + Interceptor: 61.03 ms average, 101.15 ms p95</title><rect x="0" y="186" width="710" height="30" fill="transparent"/><text class="label" x="220" y="201" text-anchor="end" dominant-baseline="central">Fastify + Undici + Interceptor</text><path class="undici" d="M230,193h158.75307165970975a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-158.75307165970975z"/><text class="value" x="398.75307165970975" y="201" dominant-baseline="central">61.0 ms</text></g></svg></div>

## Average Response Time (ms)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 132.42 | 137.90 | 100.55 | 95.81 |
| Fastify + Axios | 125.28 | 127.37 | 101.92 | 96.45 |
| Fastify + Undici | 41.10 | 42.88 | 31.26 | 28.28 |
| Express + Axios + Interceptor | 165.48 | 164.39 | 124.40 | 126.98 |
| Fastify + Axios + Interceptor | 150.78 | 152.01 | 122.89 | 115.90 |
| Fastify + Undici + Interceptor | 88.56 | 85.18 | 67.29 | 61.03 |

## P95 Response Time (ms)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 228.51 | 230.40 | 176.76 | 167.82 |
| Fastify + Axios | 216.17 | 215.98 | 177.46 | 170.22 |
| Fastify + Undici | 73.54 | 75.54 | 54.98 | 49.10 |
| Express + Axios + Interceptor | 280.78 | 291.19 | 221.85 | 260.66 |
| Fastify + Axios + Interceptor | 267.27 | 266.46 | 219.84 | 204.64 |
| Fastify + Undici + Interceptor | 139.81 | 133.50 | 107.12 | 101.15 |

## Throughput (requests/s)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 485 | 466 | 638 | 669 |
| Fastify + Axios | 512 | 504 | 629 | 665 |
| Fastify + Undici | 1552 | 1489 | 2038 | 2250 |
| Express + Axios + Interceptor | 388 | 391 | 516 | 505 |
| Fastify + Axios + Interceptor | 426 | 422 | 522 | 554 |
| Fastify + Undici + Interceptor | 723 | 751 | 950 | 1047 |

## Interceptor Overhead

How much slower the average response gets when interceptors are added.

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 25.0% | 19.2% | 23.7% | 32.5% |
| Fastify + Axios | 20.4% | 19.3% | 20.6% | 20.2% |
| Fastify + Undici | 115.4% | 98.7% | 115.3% | 115.8% |

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
- **Library build**: `nestjs-undici-interceptors@0.5.5 (edcb85f)`
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
./test-all-node-versions.sh    # Docker + k6 across Node.js 20, 22, 24 and 26
node generate-comparison-report.js --docs ../docs/benchmarks.md
```
