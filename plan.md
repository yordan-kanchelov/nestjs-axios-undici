# Plan: nestjs-axios-undici 1.0.0

This file records the plan so the work can pick up from any machine or session. Update it with every step: PR opened, reviewed, merged, or a decision made.

## Goal

Release 1.0.0 as a drop-in replacement for `@nestjs/axios`:

- Behave the way axios / `@nestjs/axios` does, as closely as possible, so that most projects can switch by changing one import.
- Keep the performance advantage over `@nestjs/axios` (currently about 2x throughput and about half the latency).
- Test automatically against the latest NestJS (12) and every supported version.
- Enforce package quality in CI: declared dependencies, types, and a frozen public API.
- Make the docs present the package on its own terms. The original fork is credited once, in the README Credits.

## How we work

- **Master branch:** `claude/v1.0.0`, merged to `main` through the master PR. This file lives there. Every feature PR targets `claude/v1.0.0`, not `main`.
- **For each step:**
  1. The worker commits and pushes to a branch named `claude/<topic>`.
  2. A PR into `claude/v1.0.0` is opened before the review starts.
  3. A reviewer reviews the PR.
  4. The worker pushes fix commits to the same PR.
  5. Once CI is green and the review is clean, the PR is merged into `claude/v1.0.0`.
  6. This file is updated.
- **Changesets:**
  - A change to the published package gets a changeset (`npx changeset`).
  - A change that affects only development or CI gets `npx changeset --empty`.
  - 1.0.0 is the major changeset added in the final step.
- **Exploration reports** go in `plan/reports/`. Reusable prototypes (tests, scripts) from the explorations go in `plan/prototypes/`. Delete `plan/prototypes/` before the master PR is merged, once everything useful has been ported.
- **Continuing locally:**
  ```bash
  git fetch origin && git checkout claude/v1.0.0
  # pick the next unchecked item below, then:
  git checkout -b claude/<topic> origin/claude/v1.0.0
  # develop on Node 24+ (Jest needs --experimental-vm-modules for ESM-only Nest 12; the npm scripts pass it)
  npm ci && npm run lint && npm run typecheck && npm test
  # open a PR into claude/v1.0.0
  ```

## Status

Master PR: #8 (`claude/v1.0.0` → `main`, draft).

Released so far:

- 0.6.0 was published by hand on 2026-09-25 (git tag / GitHub release still missing).
- 0.6.1 was published by CI through npm trusted publishing. It adds `@nestjs/core` as a peer dependency.
- Merged to main: #3 (release pipeline, Node 22/24/26), #4 (toolchain, cleanup, fixes), #5 (OIDC-only release), #6 (@nestjs/core peer), #7 (version packages 0.6.1).

## Decisions (made by the owner on 2026-09-25)

- [x] **`withCredentials`: yes.** It becomes a no-op, as in axios on Node. Cookie handling becomes opt-in through an explicit `cookieJar` option, and `http-cookie-agent` / `tough-cookie` become optional, lazily loaded peers. This is breaking and needs a changeset note.
- [x] **Redirects: do it as axios does.** Follow up to 21 redirects by default, and respect `maxRedirects` (0 disables). Use manual 3xx handling so non-redirect responses cost nothing extra, and add `ERR_FR_TOO_MANY_REDIRECTS` and `beforeRedirect`.
- [x] **Public API: trim it where nothing is lost.** Remove the legacy and internal exports listed in `plan/reports/package-quality.md`, keeping everything with a real use. For each removal, check that a supported alternative exists, and list it in the 1.0 migration notes.
- [x] **Benchmark apps: both Express and Fastify.** Use one shared app source with `CLIENT=axios|undici` and `PLATFORM=express|fastify`, and the same axiosRef interceptor in both. Raw undici is the floor.
- [x] **Minimum Node version:** `>=22.17.0` (PR #10, decided from the consumer-matrix results).

## Roadmap

Legend: `[ ]` todo, `[~]` in progress (a PR is open), `[x]` merged into `claude/v1.0.0`.

### Phase 1: automation and compatibility foundation (first)

- [x] **A. ci: package integrity checks and consumer smoke matrix** (`claude/package-checks`, PR #10, merged; engines >=22.17.0)
  - The packed tarball is checked for declared dependencies, and passed through publint and attw.
  - A consumer matrix installs it with only its peers: Nest 10/11/12 × undici 7/8, on Node 22.x-min/22/24/26, loaded as CJS and as ESM, and type-checked.
  - It runs weekly, so new upstream releases within the peer ranges get tested.
  - `engines` changes, and the README gets a supported-versions table.
  - Prototypes: `plan/prototypes/automation/consumer/`, `plan/prototypes/quality/scripts/check-deps.js`.
- [x] **B. test: suite on NestJS 12 / @nestjs/axios 12, Nest 10/11 on Node 22** (`claude/nest12-test-matrix`, PR #9, merged)
  - devDeps move to Nest 12, and Jest runs with `--experimental-vm-modules`.
  - The CI matrix is: Node 24 Nest 12 (full checks + coverage), Node 26 Nest 12, Node 24 undici 8, Node 22 Nest 11, Node 22 Nest 10.
  - Coverage uses the v8 provider (fixes the Codecov paths), `forceExit` is removed, and `form-data` becomes a devDependency.
  - Note: the required status check names change.
- [x] **C. test: API-surface parity and type-level drop-in checks** (`claude/api-parity-checks`, PR open)
  - Compare the members of `@nestjs/axios` HttpService, axiosRef and AxiosHeaders against ours, with an allowlist.
  - Compile-only drop-in tests: `AxiosRequestConfig` / `AxiosResponse` / `AxiosInstance` assignability, plus the 16 typecompat usage cases.
  - Prototypes: `plan/prototypes/automation/api-surface-parity.cjs`, `.../differential/drop-in.types.ts`, `plan/prototypes/quality/typecompat/`.
  - `tests/compat/api-surface.spec.ts` (Jest, runs in `test:jest`): fails on any un-allowlisted missing member, and on any allowlisted member that starts to exist (stale allowlist). Allowlisted gaps, all tracked to phase 2 items above:
    - `HttpService`: `instance`, `makeObservable` (protected @nestjs/axios internals, still enumerable at runtime); `query` (new in @nestjs/axios 12, not implemented).
    - `axiosRef`: not callable, and missing `getUri`, `create`, `postForm`, `putForm`, `patchForm`, `query` (needs "make axiosRef a real axios instance"); the allowlist also has the function artifacts `length`, `name`, `prototype`.
    - `axiosRef.defaults`: `transitional`, `adapter`, `transformRequest`, `transformResponse`, `timeout`, `xsrfCookieName`, `xsrfHeaderName`, `maxContentLength`, `maxBodyLength`, `env`, `validateStatus` not populated (same item); `hasOwnProperty` is allowlisted too.
    - `axiosRef.interceptors.request`: `handlers`, `forEach` internals (same item).
    - `AxiosHeaders` instance: no `concat`, `getSetCookie`, `normalize`, `toString`, and the `get/set/has*` shorthands (needs "full AxiosHeaders").
  - `tests/types/` (compile-only, `npm run typecheck:compat` = `tsc -p tests/types/tsconfig.json`, `--strict`, added to the Node 24 full-checks CI row): `drop-in.ts` (HttpService/axiosRef/HttpModuleOptions assignability against `@nestjs/axios`) and `usage.ts` (the 16 typecompat cases). Both compile against the **built** package (`../../lib`, so `typecheck:compat` runs `npm run build` first) to keep the existing "strict TypeScript in tsconfig.build.json (7 errors)" gap (phase 3) out of this check. `tests/types` is excluded from `tsconfig.json` (so it isn't loosely re-typechecked) and isn't matched by Jest's `testRegex`. Known gaps, each pinned with `// @ts-expect-error` (tracked: plan.md phase 2 "types: axios interop", except axiosRef callability which is "feat(axiosRef): make it a real axios instance"):
    - `HttpService` isn't fully assignable to `@nestjs/axios`' (its `request()` config type rejects axios' `AxiosRequestConfig`).
    - `axiosRef` isn't assignable to `AxiosInstance`.
    - `get()` doesn't accept an axios `AxiosRequestConfig` / return `Observable<AxiosResponse<T>>`.
    - `@nestjs/axios`' `HttpModuleAsyncOptions` isn't accepted by `registerAsync` (`register` with `HttpModuleOptions` already works).
    - `post<T, D>()` has no second (body) type parameter.
    - axiosRef interceptor configs: `config.headers['Authorization'] = ...` and `config.headers.set(...)` don't type-check; a callback typed `InternalAxiosRequestConfig` doesn't fit.
    - A response mock typed `Observable<AxiosResponse<T>>` doesn't fit `HttpService['get']`'s return type.
    - Not expressible as `@ts-expect-error` (no error is raised, so nothing to pin): `HttpModuleOptions` accepts typos (e.g. `{ timeuot: 5 }`) because it's effectively `& any`.
- [x] **D. test: table-driven differential harness** (`claude/differential-harness`, PR #12, merged)
  - Each scenario runs through `@nestjs/axios` and this package against one local server, and the results are compared.
  - `knownDifference` cases are cross-checked against the docs.
  - Prototypes: `plan/prototypes/automation/differential/`, plus the compat report's probe tests.
  - `tests/compat/differential/` (Jest, runs in `test:jest`): `harness.ts` plus `response.diff.spec.ts`, `request.diff.spec.ts`, `errors.diff.spec.ts`, `interceptors.diff.spec.ts`, `module.diff.spec.ts` — 183 scenarios, 77 with `knownDifference`, each pointing at one phase 2 item below. Runs in about 8s. Known-difference count per item (a case can only carry one item, so an item that touches several code paths, like the errors item, collects more):
    - fix(response): decode bodies like axios: 19
    - feat: axios default headers: 11
    - fix(observable): abort on unsubscribe and run request interceptors per subscription: 4
    - refactor(axiosRef): one config object from interceptors to response.config / error.config: 11
    - fix: follow redirects by default (21): 1
    - fix(config): transport options: 2
    - breaking: withCredentials becomes a no-op; add cookieJar: 1
    - types: axios interop: 3
    - feat(axiosRef): make it a real axios instance: 3
    - fix(errors): match axios errors: 22
    - Progress callbacks / formSerializer: not covered (no deterministic, fast repro found; left for the PR that implements it)
  - Follow-ups from the PR #12 review (not blocking):
    - Our side reuses the global undici Agent across scenarios; give each scenario a fresh dispatcher, the way the axios side gets its own `register({})`.
    - `knownDifference` only asserts that *something* differs; pin the expected differing field per case.
    - Replace the 200 ms sleep in interceptors.diff.spec.ts with polling for the close event.
    - The generic fallback normalizer in harness.ts is unused.
- [ ] **E. perf: rebuild the PR regression check.** It isn't reliable today: 2 of 4 runs of identical code failed at the 10% threshold.
  - Switch to client CPU time per request, compared with raw undici in the same round. That cancels out runner speed; the worst drift seen was ±3.9%.
  - Scenarios: get, post JSON, params and headers, the 404 error path, axiosRef interceptors.
  - Make it a required check, with one automatic re-run.
  - Prototypes: `plan/prototypes/perf/compare2.js`, `client.js`, `server.js`.

### Phase 2: compatibility fixes (one small PR each; each flips differential cases and passes the perf check)

Details and repro tests: `plan/reports/axios-compat.md` and `plan/prototypes/compat/`. ★ = must-fix for 1.0.

- [ ] ★ **fix(response): decode bodies like axios.** `+json` types, strings for non-binary responses, gzip/br/deflate with `decompress`, `blob`, and `statusText` taken from the server's reason phrase.
- [ ] ★ **feat: axios default headers.** `Accept`, `User-Agent`, `Accept-Encoding`; flatten `headers.common` / `headers.post` in module options.
- [ ] ★ **fix(observable): abort on unsubscribe and run request interceptors per subscription.** Use `defer()` so `retry()` re-runs interceptors.
- [ ] ★ **refactor(axiosRef): one config object from interceptors to `response.config` / `error.config`.**
  - Fixes retry-once loops, empty POST replays, axios-retry and axios-auth-refresh.
  - Covers axios interceptor order, `runWhen` / `synchronous`, and per-request transforms.
- [ ] ★ **fix: follow redirects by default (21)** using manual 3xx handling with no cost on other responses. Also `ERR_FR_TOO_MANY_REDIRECTS`, dropping body headers after 301/302, and `beforeRedirect`. (Owner decision.)
- [ ] ★ **fix(config): transport options.** `httpsAgent` TLS (`ca` / `cert` / `rejectUnauthorized`), `socketPath`, proxy env vars, HTTP/2 opt-in.
- [ ] ★ **breaking: `withCredentials` becomes a no-op; add an explicit `cookieJar` option.** (Owner decision.)
- [ ] ★ **types: axios interop.**
  - `AxiosRequestConfig` / `AxiosResponse` / `AxiosInstance` assignability and `post<T, D>`.
  - Typed `HttpModuleOptions`.
  - Optional `axios` peer so `instanceof axios.AxiosError` works.
  - Full `AxiosHeaders`, with `response.headers` as `AxiosHeaders`.
- [ ] **feat(axiosRef): make it a real axios instance.**
  - Callable, `getUri`, `create`, `*Form`, `query`.
  - A function `adapter` (so axios-mock-adapter works) and the full `defaults`.
  - `HttpService.query()`.
- [ ] **fix(errors): match axios errors.**
  - Wrap synchronous undici errors and set `request`.
  - Total (deadline) timeout, `timeoutErrorMessage`, `clarifyTimeoutError`.
  - Size-limit codes and precedence.
  - `validateStatus: null`, URL credentials, `allowAbsoluteUrls`.
- [ ] Progress callbacks (`onUploadProgress` / `onDownloadProgress`), `maxRate`, `formSerializer`.
- [ ] docs: update the compatibility page and the migration guide to match whatever differences remain.

### Phase 3: package quality and API (see `plan/reports/package-quality.md`)

- [ ] Resource cleanup: `OnModuleDestroy` closes the dispatchers the module created. The static module's default options become a factory.
- [ ] Option mapping:
  - replace the `__` casts with a typed resolved config
  - strip axios-only keys (such as `auth`) before calling undici
  - fix `socketPath`, the `baseURL` + UrlObject case, `keepAlive`, and the ignored `httpsAgent` TLS options
  - use Nest `Logger` instead of console
- [ ] Trim the public API (decided: remove what loses nothing), then commit an api-extractor report and check it in CI.
- [ ] HttpService members: `setDispatcher` (rename), internal `setInterceptors`, a real `interceptorCount`, a read-only `undiciRef`.
- [ ] `strict` TypeScript in `tsconfig.build.json` (7 errors).
- [ ] Duplicate undici copy: plain requests should also use an Agent from this package's undici copy.

### Phase 4: performance (see `plan/reports/performance.md`)

Measured: library overhead is small. Per-request client CPU is 41 µs, vs 35 µs for raw undici and 510–560 µs for @nestjs/axios. No memory leak, and keep-alive reuse works.

- [ ] ★ **Abort the request on unsubscribe.** This is the same item as in phase 2. It costs 1–3 µs per request.
- [ ] ★ **bench: a fair app set.**
  - Configurations: `@nestjs/axios` and nestjs-axios-undici in identical apps, each with and without the same axiosRef interceptor (no stdout logging), plus raw undici as the floor.
  - The mock backend runs with `logger: false`.
  - Drop `nestjs-fastify-undici`, the upstream `nestjs-undici` dependency, and the 3 separate compose files.
  - Decided: both Express and Fastify.
  - Update the k6 script and the report generator to match.
- [ ] ★ **A light end-to-end A/B check without Docker or k6** that runs on PRs and releases and publishes the throughput ratio. Prototype: `plan/prototypes/perf/e2e/`, not run yet; it needs `@nestjs/platform-fastify` and `autocannon`.
- [ ] Later: cheaper request-adapter paths (saves 2–8 µs), a streaming `maxContentLength` check, instruction-count benchmarks, and the full k6 run on the version PR before publish.

### Phase 5: docs (see `plan/reports/docs-critic.md`)

- [ ] bench: rewrite the report generator. The README and docs headline are generated from the same numbers, as ratios, with no caveats.
- [ ] docs: present the package on its own terms. Delete `docs/features.md`, trim the migration guide, keep the fork mention only in the README Credits.
- [ ] docs: fix inaccurate or stale statements, keep the dispatcher snippet in one place, and use consistent terminology.
- [ ] bench: turn `benchmarks/README.md` into a short how-to-run page.

### Phase 6: 1.0.0 release

- [ ] Every must-have item above is merged into `claude/v1.0.0`.
- [ ] Delete `plan/prototypes/`. Add a major changeset with migration notes from 0.6.
- [ ] Owner sign-off. Merge the master PR into `main`. Merge the "version packages" PR. Publish 1.0.0 through trusted publishing.
- [ ] Add git tags / GitHub releases for 0.6.0 (and check 0.6.1).

## Log

- 2026-09-25: Explorations done for automation, package quality, axios compatibility and docs (reports in `plan/reports/`). Performance exploration done too. Workers A and B started. Created `claude/v1.0.0` and this plan.
- 2026-09-25: PR #9 merged. PR #10 approved; fixed the CI pack step and formatting, waiting for green.
- 2026-09-25: PR #10 merged (consumer matrix green on Node 22.17.0/22.19.0/22/24/26). Worker C started (`claude/api-parity-checks`).
- 2026-09-25: PR #11 (C) merged. PR #12 (D, 183 differential scenarios, 77 known differences) open, in review.
- 2026-09-25: PR #12 (D) merged; the differential tests pass on Nest 10/11/12. Worker E (perf check) next.
- 2026-09-25: Owner decisions recorded: withCredentials becomes a no-op with an explicit cookieJar; redirects follow axios (21 by default); trim the API where nothing is lost; benchmarks cover Express and Fastify.
