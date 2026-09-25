Differential compatibility tests: each case runs the same call through @nestjs/axios (real axios 1.20.0)
and nestjs-axios-undici against one local node:http server (harness.ts) and asserts `undici` equals `axios`.
Failing tests = current behavioural differences. Run: npx jest tests/diff --testTimeout=8000
Extra deps (no-save): npm i --no-save axios@1.20.0 @nestjs/axios@4.0.1 axios-retry axios-mock-adapter axios-auth-refresh
Types: npx tsc --noEmit -p tests/diff/types/tsconfig.json ; hot-path micro-benchmark: node tests/diff/bench/hot-path-costs.js
Copy this folder to tests/diff/ in the repo to run. nest12-smoke.mjs: run in a separate dir with Nest 12 + @nestjs/axios 12 + built lib.
