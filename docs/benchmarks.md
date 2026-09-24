# Benchmarks

> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js 20, 22, 24, 26.

## Summary

- **Undici is 71-74% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).
- **Fastify + Undici is 74-75% faster than the default Express + Axios setup**, with 275-302% more throughput.
- **With interceptors**, Fastify + Undici averages 39-48ms, still faster than every Axios configuration (79-97ms at best).

## Average Response Time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 710 244" width="100%" style="max-width:710px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}@media (prefers-color-scheme:dark){.bench-chart{--ink:#fff;--ink-2:#c3c2b7;--grid:#3a3a37;--undici:#3987e5;--axios:#d95926}}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="230" y="6" width="12" height="12" rx="3"/><text class="label" x="248" y="12" dominant-baseline="central">Undici</text><rect class="axios" x="310" y="6" width="12" height="12" rx="3"/><text class="label" x="328" y="12" dominant-baseline="central">Axios</text></g><line class="grid" x1="230" x2="230" y1="30" y2="220"/><text class="tick" x="230" y="236" text-anchor="middle">0</text><line class="grid" x1="310" x2="310" y1="30" y2="220"/><text class="tick" x="310" y="236" text-anchor="middle">20</text><line class="grid" x1="390" x2="390" y1="30" y2="220"/><text class="tick" x="390" y="236" text-anchor="middle">40</text><line class="grid" x1="470" x2="470" y1="30" y2="220"/><text class="tick" x="470" y="236" text-anchor="middle">60</text><line class="grid" x1="550" x2="550" y1="30" y2="220"/><text class="tick" x="550" y="236" text-anchor="middle">80</text><line class="grid" x1="630" x2="630" y1="30" y2="220"/><text class="tick" x="630" y="236" text-anchor="middle">100</text><g class="bar"><title>Express + Axios: 79.21 ms average, 169.73 ms p95</title><rect x="0" y="36" width="710" height="30" fill="transparent"/><text class="label" x="220" y="51" text-anchor="end" dominant-baseline="central">Express + Axios</text><path class="axios" d="M230,43h312.8483891938504a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-312.8483891938504z"/><text class="value" x="552.8483891938504" y="51" dominant-baseline="central">79.2 ms</text></g><g class="bar"><title>Fastify + Axios: 79.27 ms average, 171.09 ms p95</title><rect x="0" y="66" width="710" height="30" fill="transparent"/><text class="label" x="220" y="81" text-anchor="end" dominant-baseline="central">Fastify + Axios</text><path class="axios" d="M230,73h313.06375841849376a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-313.06375841849376z"/><text class="value" x="553.0637584184938" y="81" dominant-baseline="central">79.3 ms</text></g><g class="bar"><title>Fastify + Undici: 20.47 ms average, 37.68 ms p95</title><rect x="0" y="96" width="710" height="30" fill="transparent"/><text class="label" x="220" y="111" text-anchor="end" dominant-baseline="central">Fastify + Undici</text><path class="undici" d="M230,103h77.87354470145192a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-77.87354470145192z"/><text class="value" x="317.8735447014519" y="111" dominant-baseline="central">20.5 ms</text></g><g class="bar"><title>Express + Axios + Interceptor: 98.06 ms average, 201.76 ms p95</title><rect x="0" y="126" width="710" height="30" fill="transparent"/><text class="label" x="220" y="141" text-anchor="end" dominant-baseline="central">Express + Axios + Interceptor</text><path class="axios" d="M230,133h388.2413221457641a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-388.2413221457641z"/><text class="value" x="628.2413221457641" y="141" dominant-baseline="central">98.1 ms</text></g><g class="bar"><title>Fastify + Axios + Interceptor: 94.09 ms average, 200.48 ms p95</title><rect x="0" y="156" width="710" height="30" fill="transparent"/><text class="label" x="220" y="171" text-anchor="end" dominant-baseline="central">Fastify + Axios + Interceptor</text><path class="axios" d="M230,163h372.3411460089276a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-372.3411460089276z"/><text class="value" x="612.3411460089276" y="171" dominant-baseline="central">94.1 ms</text></g><g class="bar"><title>Fastify + Undici + Interceptor: 40.24 ms average, 73.42 ms p95</title><rect x="0" y="186" width="710" height="30" fill="transparent"/><text class="label" x="220" y="201" text-anchor="end" dominant-baseline="central">Fastify + Undici + Interceptor</text><path class="undici" d="M230,193h156.95307651081941a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-156.95307651081941z"/><text class="value" x="396.9530765108194" y="201" dominant-baseline="central">40.2 ms</text></g></svg></div>

## Average Response Time (ms)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 112.35 | 98.87 | 82.50 | 79.21 |
| Fastify + Axios | 97.14 | 83.81 | 79.92 | 79.27 |
| Fastify + Undici | 28.29 | 24.49 | 21.86 | 20.47 |
| Express + Axios + Interceptor | 129.88 | 124.11 | 95.21 | 98.06 |
| Fastify + Axios + Interceptor | 108.70 | 103.02 | 90.84 | 94.09 |
| Fastify + Undici + Interceptor | 48.35 | 45.83 | 39.03 | 40.24 |

## P95 Response Time (ms)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 229.43 | 202.82 | 177.39 | 169.73 |
| Fastify + Axios | 200.34 | 175.80 | 168.42 | 171.09 |
| Fastify + Undici | 51.67 | 45.17 | 39.07 | 37.68 |
| Express + Axios + Interceptor | 257.38 | 243.93 | 185.34 | 201.76 |
| Fastify + Axios + Interceptor | 184.61 | 190.33 | 182.78 | 200.48 |
| Fastify + Undici + Interceptor | 81.80 | 81.97 | 70.33 | 73.42 |

## Throughput (requests/s)

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 571 | 649 | 777 | 809 |
| Fastify + Axios | 660 | 765 | 802 | 809 |
| Fastify + Undici | 2257 | 2606 | 2915 | 3113 |
| Express + Axios + Interceptor | 494 | 517 | 674 | 654 |
| Fastify + Axios + Interceptor | 590 | 623 | 706 | 682 |
| Fastify + Undici + Interceptor | 1324 | 1396 | 1639 | 1589 |

## Interceptor Overhead

How much slower the average response gets when interceptors are added.

| Configuration | Node 20 | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|---:|
| Express + Axios | 15.6% | 25.5% | 15.4% | 23.8% |
| Fastify + Axios | 11.9% | 22.9% | 13.7% | 18.7% |
| Fastify + Undici | 70.9% | 87.2% | 78.5% | 96.6% |

> The Undici interceptor app uses `nestjs-undici-interceptors`, which returns axios-compatible responses (body read and parsed), while the plain Undici app uses upstream `nestjs-undici` and returns the raw body stream. Its overhead therefore includes the axios-compatible response adaptation, not only the interceptors.

## Configurations

| Configuration | Server | HTTP client |
|---|---|---|
| Express + Axios | Express | `@nestjs/axios` |
| Fastify + Axios | Fastify | `@nestjs/axios` |
| Fastify + Undici | Fastify | `nestjs-undici` (upstream) |
| Express/Fastify + Axios + Interceptor | Express/Fastify | `@nestjs/axios` with request/response interceptors |
| Fastify + Undici + Interceptor | Fastify | `nestjs-undici-interceptors` (this repository) with a logging interceptor |

## Environment

- **Where**: Local run on a single shared cloud VM (apps on native Node.js, k6 in Docker, same host) - compare configurations, not absolute ms, against Docker CI results
- **Library build**: `nestjs-undici-interceptors@0.5.5 (npm)`
- **Load**: 0 → 50 → 100 virtual users over 70 seconds per configuration, configurations run one after another
- **Runs**: 2026-09-24

Absolute latencies depend on the machine; compare configurations within a run.

## Regression Checks

Every pull request that touches `src/` runs an `HttpService` micro-benchmark against the base branch on the same runner and fails if throughput drops by more than 10%. See [`benchmarks/micro`](https://github.com/yordan-kanchelov/nestjs-undici/tree/main/benchmarks/micro).

## Running the Benchmarks

```bash
cd benchmarks
./scripts/pack-lib.sh          # build and pack the library from this checkout
npm ci && npm run install-lib  # install benchmark deps + the packed library
./test-all-node-versions.sh    # Docker + k6 across Node.js 20, 22, 24 and 26
node generate-comparison-report.js --docs ../docs/benchmarks.md
```
