# Benchmarks

> This page is generated from the latest results in [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Each NestJS app below receives a request and makes **5 parallel HTTP calls** to a mock upstream service, under a k6 load ramping to 100 concurrent users. Tested on Node.js 22, 24, 26.

## Summary

- **Undici is 66-71% faster than Axios** with the same framework (Fastify + Undici vs Fastify + Axios).
- **Fastify + Undici is 67-72% faster than the default Express + Axios setup**, with 202-250% more throughput.
- **With interceptors**, Fastify + Undici averages 28-77ms, still faster than every Axios configuration (54-127ms at best).

## Average Response Time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 710 244" width="100%" style="max-width:710px;min-width:560px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="230" y="6" width="12" height="12" rx="3"/><text class="label" x="248" y="12" dominant-baseline="central">Undici</text><rect class="axios" x="310" y="6" width="12" height="12" rx="3"/><text class="label" x="328" y="12" dominant-baseline="central">Axios</text></g><line class="grid" x1="230" x2="230" y1="30" y2="220"/><text class="tick" x="230" y="236" text-anchor="middle">0</text><line class="grid" x1="330" x2="330" y1="30" y2="220"/><text class="tick" x="330" y="236" text-anchor="middle">20</text><line class="grid" x1="430" x2="430" y1="30" y2="220"/><text class="tick" x="430" y="236" text-anchor="middle">40</text><line class="grid" x1="530" x2="530" y1="30" y2="220"/><text class="tick" x="530" y="236" text-anchor="middle">60</text><line class="grid" x1="630" x2="630" y1="30" y2="220"/><text class="tick" x="630" y="236" text-anchor="middle">80</text><g class="bar"><title>Express + Axios: 55.59 ms average, 95.15 ms p95</title><rect x="0" y="36" width="710" height="30" fill="transparent"/><text class="label" x="220" y="51" text-anchor="end" dominant-baseline="central">Express + Axios</text><path class="axios" d="M230,43h273.95222485495236a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-273.95222485495236z"/><text class="value" x="513.9522248549524" y="51" dominant-baseline="central">55.6 ms</text></g><g class="bar"><title>Fastify + Axios: 54.48 ms average, 93.44 ms p95</title><rect x="0" y="66" width="710" height="30" fill="transparent"/><text class="label" x="220" y="81" text-anchor="end" dominant-baseline="central">Fastify + Axios</text><path class="axios" d="M230,73h268.3979575208003a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-268.3979575208003z"/><text class="value" x="508.3979575208003" y="81" dominant-baseline="central">54.5 ms</text></g><g class="bar"><title>Fastify + Undici: 15.74 ms average, 26.89 ms p95</title><rect x="0" y="96" width="710" height="30" fill="transparent"/><text class="label" x="220" y="111" text-anchor="end" dominant-baseline="central">Fastify + Undici</text><path class="undici" d="M230,103h74.70662435682578a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-74.70662435682578z"/><text class="value" x="314.7066243568258" y="111" dominant-baseline="central">15.7 ms</text></g><g class="bar"><title>Express + Axios + Interceptor: 75.73 ms average, 136.97 ms p95</title><rect x="0" y="126" width="710" height="30" fill="transparent"/><text class="label" x="220" y="141" text-anchor="end" dominant-baseline="central">Express + Axios + Interceptor</text><path class="axios" d="M230,133h374.66128915383297a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-374.66128915383297z"/><text class="value" x="614.661289153833" y="141" dominant-baseline="central">75.7 ms</text></g><g class="bar"><title>Fastify + Axios + Interceptor: 70.24 ms average, 123.98 ms p95</title><rect x="0" y="156" width="710" height="30" fill="transparent"/><text class="label" x="220" y="171" text-anchor="end" dominant-baseline="central">Fastify + Axios + Interceptor</text><path class="axios" d="M230,163h347.201548470269a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-347.201548470269z"/><text class="value" x="587.201548470269" y="171" dominant-baseline="central">70.2 ms</text></g><g class="bar"><title>Fastify + Undici + Interceptor: 28.15 ms average, 46.71 ms p95</title><rect x="0" y="186" width="710" height="30" fill="transparent"/><text class="label" x="220" y="201" text-anchor="end" dominant-baseline="central">Fastify + Undici + Interceptor</text><path class="undici" d="M230,193h136.72549576067428a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-136.72549576067428z"/><text class="value" x="376.7254957606743" y="201" dominant-baseline="central">28.1 ms</text></g></svg></div>

## Average Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 132.43 | 115.17 | 55.59 |
| Fastify + Axios | 126.86 | 115.93 | 54.48 |
| Fastify + Undici | 43.20 | 37.84 | 15.74 |
| Express + Axios + Interceptor | 165.08 | 141.34 | 75.73 |
| Fastify + Axios + Interceptor | 149.03 | 136.24 | 70.24 |
| Fastify + Undici + Interceptor | 77.08 | 70.03 | 28.15 |

## P95 Response Time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 225.03 | 199.33 | 95.15 |
| Fastify + Axios | 212.55 | 201.55 | 93.44 |
| Fastify + Undici | 75.44 | 66.02 | 26.89 |
| Express + Axios + Interceptor | 282.83 | 250.40 | 136.97 |
| Fastify + Axios + Interceptor | 260.79 | 240.68 | 123.98 |
| Fastify + Undici + Interceptor | 120.67 | 111.54 | 46.71 |

## Throughput (requests/s)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 485 | 557 | 1153 |
| Fastify + Axios | 506 | 554 | 1176 |
| Fastify + Undici | 1478 | 1685 | 4031 |
| Express + Axios + Interceptor | 389 | 454 | 847 |
| Fastify + Axios + Interceptor | 431 | 471 | 912 |
| Fastify + Undici + Interceptor | 830 | 913 | 2264 |

## Interceptor Overhead

How much slower the average response gets when interceptors are added.

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + Axios | 24.6% | 22.7% | 36.2% |
| Fastify + Axios | 17.5% | 17.5% | 28.9% |
| Fastify + Undici | 78.4% | 85.1% | 78.8% |

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
- **Library build**: `nestjs-axios-undici@0.6.0 (0ec2451)`
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
