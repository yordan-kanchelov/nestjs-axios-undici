// ad-hoc probe: npx jest tests/diff/probe.spec.ts ; edit CALLS
import { base, both, closeModules, pair, startServer, stopServer } from './harness';
export async function probe(calls: Record<string, (s: any) => any>, opts?: any, moduleOpts?: any) {
  await startServer();
  const p = await pair(moduleOpts);
  for (const [name, fn] of Object.entries(calls)) {
    const r = await both(p, s => fn(s), opts);
    process.stdout.write(`\n### ${name}\n  axios : ${JSON.stringify(r.axios)}\n  undici: ${JSON.stringify(r.undici)}\n`);
  }
  await closeModules(); await stopServer();
}
export { base };
