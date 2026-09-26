# Benchmarks

> Generated from [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

Same NestJS app, only the import changed: **nestjs-axios-undici served 4.0-4.2x the requests/s of @nestjs/axios, with 77% lower p95 latency** (Express and Fastify, Node.js 24).

## Throughput and latency ratios

nestjs-axios-undici against `@nestjs/axios`, same platform, same app, only the import changed. Lower latency is better; a throughput ratio above 1x means more requests/s.

| Platform | Throughput | Avg latency | P95 latency |
|---|---:|---:|---:|
| Express | 4.0x | 75% lower | 77% lower |
| Fastify | 4.2x | 76% lower | 77% lower |
| Express, with an interceptor | 2.2x | 54% lower | 53% lower |

## Average response time on Node.js 24

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 740 274" width="100%" style="max-width:740px;min-width:620px" role="img" aria-label="Average response time in milliseconds on Node.js 24, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;--raw:#9a9890;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .raw{fill:var(--raw)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="260" y="6" width="12" height="12" rx="3"/><text class="label" x="278" y="12" dominant-baseline="central">nestjs-axios-undici</text><rect class="axios" x="410" y="6" width="12" height="12" rx="3"/><text class="label" x="428" y="12" dominant-baseline="central">@nestjs/axios</text><rect class="raw" x="520" y="6" width="12" height="12" rx="3"/><text class="label" x="538" y="12" dominant-baseline="central">Raw undici</text></g><line class="grid" x1="260" x2="260" y1="30" y2="250"/><text class="tick" x="260" y="266" text-anchor="middle">0</text><line class="grid" x1="360" x2="360" y1="30" y2="250"/><text class="tick" x="360" y="266" text-anchor="middle">10</text><line class="grid" x1="460" x2="460" y1="30" y2="250"/><text class="tick" x="460" y="266" text-anchor="middle">20</text><line class="grid" x1="560" x2="560" y1="30" y2="250"/><text class="tick" x="560" y="266" text-anchor="middle">30</text><line class="grid" x1="660" x2="660" y1="30" y2="250"/><text class="tick" x="660" y="266" text-anchor="middle">40</text><g class="bar"><title>Express + @nestjs/axios: 35.86 ms average, 51.86 ms p95</title><rect x="0" y="36" width="740" height="30" fill="transparent"/><text class="label" x="250" y="51" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios</text><path class="axios" d="M260,43h354.6456688816054a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-354.6456688816054z"/><text class="value" x="624.6456688816054" y="51" dominant-baseline="central">35.9 ms</text></g><g class="bar"><title>Express + nestjs-axios-undici: 8.99 ms average, 11.69 ms p95</title><rect x="0" y="66" width="740" height="30" fill="transparent"/><text class="label" x="250" y="81" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici</text><path class="undici" d="M260,73h85.9457353793897a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-85.9457353793897z"/><text class="value" x="355.9457353793897" y="81" dominant-baseline="central">9.0 ms</text></g><g class="bar"><title>Fastify + @nestjs/axios: 31.94 ms average, 45.52 ms p95</title><rect x="0" y="96" width="740" height="30" fill="transparent"/><text class="label" x="250" y="111" text-anchor="end" dominant-baseline="central">Fastify + @nestjs/axios</text><path class="axios" d="M260,103h315.39049227812257a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-315.39049227812257z"/><text class="value" x="585.3904922781226" y="111" dominant-baseline="central">31.9 ms</text></g><g class="bar"><title>Fastify + nestjs-axios-undici: 7.69 ms average, 10.41 ms p95</title><rect x="0" y="126" width="740" height="30" fill="transparent"/><text class="label" x="250" y="141" text-anchor="end" dominant-baseline="central">Fastify + nestjs-axios-undici</text><path class="undici" d="M260,133h72.93700907405082a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-72.93700907405082z"/><text class="value" x="342.9370090740508" y="141" dominant-baseline="central">7.7 ms</text></g><g class="bar"><title>Express + @nestjs/axios + interceptor: 36.04 ms average, 49.46 ms p95</title><rect x="0" y="156" width="740" height="30" fill="transparent"/><text class="label" x="250" y="171" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios + interceptor</text><path class="axios" d="M260,163h356.4444671448539a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-356.4444671448539z"/><text class="value" x="626.4444671448539" y="171" dominant-baseline="central">36.0 ms</text></g><g class="bar"><title>Express + nestjs-axios-undici + interceptor: 16.50 ms average, 23.43 ms p95</title><rect x="0" y="186" width="740" height="30" fill="transparent"/><text class="label" x="250" y="201" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici + interceptor</text><path class="undici" d="M260,193h160.99661475867788a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-160.99661475867788z"/><text class="value" x="430.9966147586779" y="201" dominant-baseline="central">16.5 ms</text></g><g class="bar"><title>Raw undici (floor): 8.49 ms average, 16.77 ms p95</title><rect x="0" y="216" width="740" height="30" fill="transparent"/><text class="label" x="250" y="231" text-anchor="end" dominant-baseline="central">Raw undici (floor)</text><path class="raw" d="M260,223h80.94984797946432a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-80.94984797946432z"/><text class="value" x="350.9498479794643" y="231" dominant-baseline="central">8.5 ms</text></g></svg></div>

## What's measured

- Each app makes 5 parallel GET calls to a mock backend and returns the parsed bodies; only the `HttpModule`/`HttpService` import changes between the two rows for a given platform - see [`benchmarks/apps/nestjs-app`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/apps/nestjs-app).
- The "with an interceptor" rows add the same `axiosRef` request/response interceptor to both clients (it sets a header and times the call), with no per-request logging.
- [`benchmarks/apps/undici-raw`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/apps/undici-raw) calls undici directly, with no `HttpModule`/`HttpService` at all, as a floor for the other rows.

## Full results

Tested on Node.js 24. See Environment below for how these numbers were produced.

### Average response time (ms)

| Configuration | Node 24 |
|---|---:|
| Express + @nestjs/axios | 35.86 |
| Express + nestjs-axios-undici | 8.99 |
| Fastify + @nestjs/axios | 31.94 |
| Fastify + nestjs-axios-undici | 7.69 |
| Express + @nestjs/axios + interceptor | 36.04 |
| Express + nestjs-axios-undici + interceptor | 16.50 |
| Raw undici (floor) | 8.49 |

### P95 response time (ms)

| Configuration | Node 24 |
|---|---:|
| Express + @nestjs/axios | 51.86 |
| Express + nestjs-axios-undici | 11.69 |
| Fastify + @nestjs/axios | 45.52 |
| Fastify + nestjs-axios-undici | 10.41 |
| Express + @nestjs/axios + interceptor | 49.46 |
| Express + nestjs-axios-undici + interceptor | 23.43 |
| Raw undici (floor) | 16.77 |

### Throughput (requests/s)

| Configuration | Node 24 |
|---|---:|
| Express + @nestjs/axios | 835 |
| Express + nestjs-axios-undici | 3334 |
| Fastify + @nestjs/axios | 937 |
| Fastify + nestjs-axios-undici | 3896 |
| Express + @nestjs/axios + interceptor | 831 |
| Express + nestjs-axios-undici + interceptor | 1817 |
| Raw undici (floor) | 3528 |

## Environment

- **Where**: Local run (this sandbox), benchmarks/e2e harness (no Docker, no k6), single Node.js version
- **Library build**: `nestjs-axios-undici@0.6.1 (ef37707)`
- **Packages**: nestjs-axios-undici 0.6.1, @nestjs/axios 4.0.1, axios 1.20.0, undici 7.29.1, @nestjs/core 11.2.6
- **Runs**: 2026-09-26

Absolute latencies depend on the machine; compare configurations within a run.

## Regression check

Every pull request that touches `src/` runs an `HttpService` micro-benchmark against the base branch on the same runner and fails if client CPU per request rises by more than 10%. See [`benchmarks/micro`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/micro). A lighter, no-Docker end-to-end check also runs on pull requests and publishes the throughput ratio; see [`benchmarks/e2e`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/e2e).

## Reproduce

```bash
cd benchmarks
./scripts/pack-lib.sh          # build and pack the library from this checkout
npm ci && npm run install-lib  # install benchmark deps + the packed library
./test-all-node-versions.sh    # Docker + k6 across Node.js 22, 24 and 26
node generate-comparison-report.js --docs ../docs/benchmarks.md
node generate-comparison-report.js --headline ../README.md   # root README
node generate-comparison-report.js --headline README.md      # benchmarks/README.md
```

Or, without Docker or k6: `npm run bench:ab` (see [`benchmarks/README.md`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/README.md)).
