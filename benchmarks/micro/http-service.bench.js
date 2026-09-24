// Measures HttpService throughput for one library build and one scenario.
// Usage: node http-service.bench.js --lib <dir> --url <url> --scenario <name> [--duration 5] [--concurrency 50]
// Prints one JSON line: { scenario, rps, requests, errors }.
require('reflect-metadata');
const path = require('node:path');
const { lastValueFrom } = require('rxjs');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), [])
);
const libDir = path.resolve(args.lib);
const url = args.url;
const durationMs = Number(args.duration || 5) * 1000;
const concurrency = Number(args.concurrency || 50);

const { HttpService } = require(libDir);

const passThrough = (request, next) => next.handle(request);

const SCENARIOS = {
  // Plain GET through the axios-compatible response adapter.
  request: () => new HttpService({}),
  // Same request with two native interceptors and one axios-style interceptor.
  interceptors: () => {
    const service = new HttpService({}, { interceptors: [passThrough, passThrough] });
    service.axiosRef.interceptors.request.use((config) => config);
    return service;
  },
};

async function main() {
  const create = SCENARIOS[args.scenario];
  if (!create) throw new Error(`Unknown scenario ${args.scenario}; expected ${Object.keys(SCENARIOS).join(', ')}`);
  const service = create();
  const once = () => lastValueFrom(service.get(url));

  // Warm up connections and JIT before measuring.
  const warmupEnd = Date.now() + 1000;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (Date.now() < warmupEnd) await once();
  }));

  let requests = 0;
  let errors = 0;
  const start = process.hrtime.bigint();
  const end = Date.now() + durationMs;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (Date.now() < end) {
      try {
        const res = await once();
        if (res.status !== 200 || res.data?.id !== 1) errors++;
      } catch {
        errors++;
      }
      requests++;
    }
  }));
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  console.log(JSON.stringify({ scenario: args.scenario, rps: requests / seconds, requests, errors }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
