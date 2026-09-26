# Benchmarks

> Generated from [`benchmarks/results`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/results) by `benchmarks/generate-comparison-report.js --docs`.

In the same NestJS app, with only the import changed, **nestjs-axios-undici served 2.0-2.5x the requests per second of @nestjs/axios, with 51-62% lower p95 latency**, on Express and Fastify with Node.js 22, 24, 26.

## Throughput and latency ratios

Each row compares nestjs-axios-undici with `@nestjs/axios` in the same app on the same platform. Only the import changes. A throughput ratio above 1x means more requests per second.

| Platform | Throughput | Avg latency | P95 latency |
|---|---:|---:|---:|
| Express | 2.0-2.4x | 50-59% lower | 51-59% lower |
| Fastify | 2.4-2.5x | 59-61% lower | 59-62% lower |
| Express, with an interceptor | 1.7-1.8x | 41-45% lower | 43-46% lower |

## Throughput on Node.js 26

Requests per second; higher is better. Each nestjs-axios-undici bar shows its multiple of `@nestjs/axios` on the same platform.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 810 274" width="100%" style="max-width:810px;min-width:620px" role="img" aria-label="Throughput in requests per second on Node.js 26, higher is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;--raw:#9a9890;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .raw{fill:var(--raw)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="260" y="6" width="12" height="12" rx="3"/><text class="label" x="278" y="12" dominant-baseline="central">nestjs-axios-undici</text><rect class="axios" x="410" y="6" width="12" height="12" rx="3"/><text class="label" x="428" y="12" dominant-baseline="central">@nestjs/axios</text><rect class="raw" x="520" y="6" width="12" height="12" rx="3"/><text class="label" x="538" y="12" dominant-baseline="central">Raw undici</text></g><line class="grid" x1="260" x2="260" y1="30" y2="250"/><text class="tick" x="260" y="266" text-anchor="middle">0</text><line class="grid" x1="393.3333333333333" x2="393.3333333333333" y1="30" y2="250"/><text class="tick" x="393.3333333333333" y="266" text-anchor="middle">2000</text><line class="grid" x1="526.6666666666666" x2="526.6666666666666" y1="30" y2="250"/><text class="tick" x="526.6666666666666" y="266" text-anchor="middle">4000</text><line class="grid" x1="660" x2="660" y1="30" y2="250"/><text class="tick" x="660" y="266" text-anchor="middle">6000</text><g class="bar"><title>Express + @nestjs/axios: 1,759 requests/s</title><rect x="0" y="36" width="810" height="30" fill="transparent"/><text class="label" x="250" y="51" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios</text><path class="axios" d="M260,43h113.28095238095239a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-113.28095238095239z"/><text class="value" x="383.2809523809524" y="51" dominant-baseline="central">1,759 req/s</text></g><g class="bar"><title>Express + nestjs-axios-undici: 4,260 requests/s, 2.42x Express + @nestjs/axios</title><rect x="0" y="66" width="810" height="30" fill="transparent"/><text class="label" x="250" y="81" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici</text><path class="undici" d="M260,73h279.9790476190476a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-279.9790476190476z"/><text class="value" x="549.9790476190476" y="81" dominant-baseline="central">4,260 req/s (2.4x)</text></g><g class="bar"><title>Fastify + @nestjs/axios: 1,816 requests/s</title><rect x="0" y="96" width="810" height="30" fill="transparent"/><text class="label" x="250" y="111" text-anchor="end" dominant-baseline="central">Fastify + @nestjs/axios</text><path class="axios" d="M260,103h117.08761904761906a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-117.08761904761906z"/><text class="value" x="387.08761904761906" y="111" dominant-baseline="central">1,816 req/s</text></g><g class="bar"><title>Fastify + nestjs-axios-undici: 4,609 requests/s, 2.54x Fastify + @nestjs/axios</title><rect x="0" y="126" width="810" height="30" fill="transparent"/><text class="label" x="250" y="141" text-anchor="end" dominant-baseline="central">Fastify + nestjs-axios-undici</text><path class="undici" d="M260,133h303.23523809523806a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-303.23523809523806z"/><text class="value" x="573.2352380952381" y="141" dominant-baseline="central">4,609 req/s (2.5x)</text></g><g class="bar"><title>Express + @nestjs/axios + interceptor: 1,605 requests/s</title><rect x="0" y="156" width="810" height="30" fill="transparent"/><text class="label" x="250" y="171" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios + interceptor</text><path class="axios" d="M260,163h102.99142857142857a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-102.99142857142857z"/><text class="value" x="372.99142857142857" y="171" dominant-baseline="central">1,605 req/s</text></g><g class="bar"><title>Express + nestjs-axios-undici + interceptor: 2,919 requests/s, 1.82x Express + @nestjs/axios + interceptor</title><rect x="0" y="186" width="810" height="30" fill="transparent"/><text class="label" x="250" y="201" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici + interceptor</text><path class="undici" d="M260,193h190.60095238095232a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-190.60095238095232z"/><text class="value" x="460.6009523809523" y="201" dominant-baseline="central">2,919 req/s (1.8x)</text></g><g class="bar"><title>Raw undici (floor): 5,336 requests/s</title><rect x="0" y="216" width="810" height="30" fill="transparent"/><text class="label" x="250" y="231" text-anchor="end" dominant-baseline="central">Raw undici (floor)</text><path class="raw" d="M260,223h351.71238095238095a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-351.71238095238095z"/><text class="value" x="621.712380952381" y="231" dominant-baseline="central">5,336 req/s</text></g></svg></div>

## Average response time on Node.js 26

Lower is better. Hover a bar for its p95.

<div style="overflow-x:auto"><svg class="bench-chart" viewBox="0 0 740 274" width="100%" style="max-width:740px;min-width:620px" role="img" aria-label="Average response time in milliseconds on Node.js 26, lower is better"><style>.bench-chart{--ink:#0b0b0b;--ink-2:#52514e;--grid:#e4e3df;--undici:#2a78d6;--axios:#eb6834;--raw:#9a9890;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}.bench-chart .label{fill:var(--ink)}.bench-chart .value,.bench-chart .tick{fill:var(--ink-2);font-variant-numeric:tabular-nums}.bench-chart .grid{stroke:var(--grid);stroke-width:1}.bench-chart .undici{fill:var(--undici)}.bench-chart .axios{fill:var(--axios)}.bench-chart .raw{fill:var(--raw)}.bench-chart .bar:hover path{opacity:.85}</style><g class="legend"><rect class="undici" x="260" y="6" width="12" height="12" rx="3"/><text class="label" x="278" y="12" dominant-baseline="central">nestjs-axios-undici</text><rect class="axios" x="410" y="6" width="12" height="12" rx="3"/><text class="label" x="428" y="12" dominant-baseline="central">@nestjs/axios</text><rect class="raw" x="520" y="6" width="12" height="12" rx="3"/><text class="label" x="538" y="12" dominant-baseline="central">Raw undici</text></g><line class="grid" x1="260" x2="260" y1="30" y2="250"/><text class="tick" x="260" y="266" text-anchor="middle">0</text><line class="grid" x1="360" x2="360" y1="30" y2="250"/><text class="tick" x="360" y="266" text-anchor="middle">10</text><line class="grid" x1="460" x2="460" y1="30" y2="250"/><text class="tick" x="460" y="266" text-anchor="middle">20</text><line class="grid" x1="560" x2="560" y1="30" y2="250"/><text class="tick" x="560" y="266" text-anchor="middle">30</text><line class="grid" x1="660" x2="660" y1="30" y2="250"/><text class="tick" x="660" y="266" text-anchor="middle">40</text><g class="bar"><title>Express + @nestjs/axios: 36.41 ms average, 64.78 ms p95</title><rect x="0" y="36" width="740" height="30" fill="transparent"/><text class="label" x="250" y="51" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios</text><path class="axios" d="M260,43h360.0553327620312a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-360.0553327620312z"/><text class="value" x="630.0553327620312" y="51" dominant-baseline="central">36.4 ms</text></g><g class="bar"><title>Express + nestjs-axios-undici: 14.96 ms average, 26.69 ms p95</title><rect x="0" y="66" width="740" height="30" fill="transparent"/><text class="label" x="250" y="81" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici</text><path class="undici" d="M260,73h145.5683090349059a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-145.5683090349059z"/><text class="value" x="415.5683090349059" y="81" dominant-baseline="central">15.0 ms</text></g><g class="bar"><title>Fastify + @nestjs/axios: 35.26 ms average, 63.39 ms p95</title><rect x="0" y="96" width="740" height="30" fill="transparent"/><text class="label" x="250" y="111" text-anchor="end" dominant-baseline="central">Fastify + @nestjs/axios</text><path class="axios" d="M260,103h348.59756809795147a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-348.59756809795147z"/><text class="value" x="618.5975680979515" y="111" dominant-baseline="central">35.3 ms</text></g><g class="bar"><title>Fastify + nestjs-axios-undici: 13.81 ms average, 24.04 ms p95</title><rect x="0" y="126" width="740" height="30" fill="transparent"/><text class="label" x="250" y="141" text-anchor="end" dominant-baseline="central">Fastify + nestjs-axios-undici</text><path class="undici" d="M260,133h134.12756074514033a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-134.12756074514033z"/><text class="value" x="404.12756074514033" y="141" dominant-baseline="central">13.8 ms</text></g><g class="bar"><title>Express + @nestjs/axios + interceptor: 39.92 ms average, 71.10 ms p95</title><rect x="0" y="156" width="740" height="30" fill="transparent"/><text class="label" x="250" y="171" text-anchor="end" dominant-baseline="central">Express + @nestjs/axios + interceptor</text><path class="axios" d="M260,163h395.21884648854484a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-395.21884648854484z"/><text class="value" x="665.2188464885448" y="171" dominant-baseline="central">39.9 ms</text></g><g class="bar"><title>Express + nestjs-axios-undici + interceptor: 21.89 ms average, 38.08 ms p95</title><rect x="0" y="186" width="740" height="30" fill="transparent"/><text class="label" x="250" y="201" text-anchor="end" dominant-baseline="central">Express + nestjs-axios-undici + interceptor</text><path class="undici" d="M260,193h214.89579837699887a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-214.89579837699887z"/><text class="value" x="484.89579837699887" y="201" dominant-baseline="central">21.9 ms</text></g><g class="bar"><title>Raw undici (floor): 11.91 ms average, 21.04 ms p95</title><rect x="0" y="216" width="740" height="30" fill="transparent"/><text class="label" x="250" y="231" text-anchor="end" dominant-baseline="central">Raw undici (floor)</text><path class="raw" d="M260,223h115.090816945553a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h-115.090816945553z"/><text class="value" x="385.090816945553" y="231" dominant-baseline="central">11.9 ms</text></g></svg></div>

## What's measured

- Each request to the app makes 5 parallel GET calls to a mock backend and returns the parsed bodies. For a given platform, only the `HttpModule`/`HttpService` import changes between the two rows. The app is [`benchmarks/apps/nestjs-app`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/apps/nestjs-app).
- The "with an interceptor" rows add the same `axiosRef` request and response interceptor to both clients. It sets a header and times the call, and logs nothing per request.
- [`benchmarks/apps/undici-raw`](https://github.com/yordan-kanchelov/nestjs-axios-undici/tree/main/benchmarks/apps/undici-raw) calls undici directly, with no `HttpModule`/`HttpService` at all, as a floor for the other rows.

## Full results

Tested on Node.js 22, 24, 26. The Environment section below says where these numbers come from.

### Average response time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + @nestjs/axios | 55.87 | 101.44 | 36.41 |
| Express + nestjs-axios-undici | 27.76 | 46.22 | 14.96 |
| Fastify + @nestjs/axios | 50.56 | 105.14 | 35.26 |
| Fastify + nestjs-axios-undici | 20.77 | 43.60 | 13.81 |
| Express + @nestjs/axios + interceptor | 61.76 | 102.65 | 39.92 |
| Express + nestjs-axios-undici + interceptor | 36.56 | 60.02 | 21.89 |
| Raw undici (floor) | 18.03 | 34.81 | 11.91 |

### P95 response time (ms)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + @nestjs/axios | 101.71 | 181.57 | 64.78 |
| Express + nestjs-axios-undici | 50.03 | 83.58 | 26.69 |
| Fastify + @nestjs/axios | 92.19 | 187.21 | 63.39 |
| Fastify + nestjs-axios-undici | 37.40 | 72.65 | 24.04 |
| Express + @nestjs/axios + interceptor | 114.83 | 184.05 | 71.10 |
| Express + nestjs-axios-undici + interceptor | 65.41 | 99.80 | 38.08 |
| Raw undici (floor) | 33.52 | 61.63 | 21.04 |

### Throughput (requests/s)

| Configuration | Node 22 | Node 24 | Node 26 |
|---|---:|---:|---:|
| Express + @nestjs/axios | 1147 | 632 | 1759 |
| Express + nestjs-axios-undici | 2304 | 1383 | 4260 |
| Fastify + @nestjs/axios | 1268 | 610 | 1816 |
| Fastify + nestjs-axios-undici | 3074 | 1464 | 4609 |
| Express + @nestjs/axios + interceptor | 1038 | 625 | 1605 |
| Express + nestjs-axios-undici + interceptor | 1752 | 1067 | 2919 |
| Raw undici (floor) | 3535 | 1833 | 5336 |

## Environment

- **Where**: GitHub Actions ubuntu-latest runner, Docker Compose (one container per app), k6 on the same runner
- **Library build**: `nestjs-axios-undici@1.0.0 (8f104b3)`
- **Packages**: nestjs-axios-undici N/A, @nestjs/axios ^4.0.1, axios ^1.20.0, undici ^7.29.1, @nestjs/core ^11.2.6
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
