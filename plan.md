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

## Decisions needed from the owner

Each of these is breaking and hard to change after 1.0.

- [ ] **`withCredentials`.** axios ignores it on Node. Here it turns on one cookie jar per service, so cookies from one user's upstream call can reach other users. Proposal: an explicit `cookieJar` option, with `http-cookie-agent` and `tough-cookie` becoming optional, lazily loaded peers (they cost about 150 ms at load).
- [ ] **Redirect default.** axios follows up to 21 redirects by default; we follow none unless `maxRedirects` is set. Proposal: match axios.
- [ ] **Trim the public API**, from 57 exported symbols down to about 25. See `plan/reports/package-quality.md`. Option: ship 0.7 with `@deprecated` tags first.
- [ ] **Minimum Node version.** Node 22.12–22.16 breaks for ESM apps on Nest 12, and undici 8 needs 22.19. Proposal: `>=22.19.0` (the PR A worker decides from test results).

## Roadmap

Legend: `[ ]` todo, `[~]` in progress (a PR is open), `[x]` merged into `claude/v1.0.0`.

### Phase 1: automation and compatibility foundation (first)

- [~] **A. ci: package integrity checks and consumer smoke matrix** (`claude/package-checks`, PR #10, in review; engines set to >=22.17.0)
  - The packed tarball is checked for declared dependencies, and passed through publint and attw.
  - A consumer matrix installs it with only its peers: Nest 10/11/12 × undici 7/8, on Node 22.x-min/22/24/26, loaded as CJS and as ESM, and type-checked.
  - It runs weekly, so new upstream releases within the peer ranges get tested.
  - `engines` changes, and the README gets a supported-versions table.
  - Prototypes: `plan/prototypes/automation/consumer/`, `plan/prototypes/quality/scripts/check-deps.js`.
- [~] **B. test: suite on NestJS 12 / @nestjs/axios 12, Nest 10/11 on Node 22** (`claude/nest12-test-matrix`, PR #9, in review)
  - devDeps move to Nest 12, and Jest runs with `--experimental-vm-modules`.
  - The CI matrix is: Node 24 Nest 12 (full checks + coverage), Node 26 Nest 12, Node 24 undici 8, Node 22 Nest 11, Node 22 Nest 10.
  - Coverage uses the v8 provider (fixes the Codecov paths), `forceExit` is removed, and `form-data` becomes a devDependency.
  - Note: the required status check names change.
- [ ] **C. test: API-surface parity and type-level drop-in checks**
  - Compare the members of `@nestjs/axios` HttpService, axiosRef and AxiosHeaders against ours, with an allowlist.
  - Compile-only drop-in tests: `AxiosRequestConfig` / `AxiosResponse` / `AxiosInstance` assignability, plus the 16 typecompat usage cases.
  - Prototypes: `plan/prototypes/automation/api-surface-parity.cjs`, `.../differential/drop-in.types.ts`, `plan/prototypes/quality/typecompat/`.
- [ ] **D. test: table-driven differential harness**
  - Each scenario runs through `@nestjs/axios` and this package against one local server, and the results are compared.
  - `knownDifference` cases are cross-checked against the docs.
  - Prototypes: `plan/prototypes/automation/differential/`, plus the compat report's probe tests.
- [ ] **E. perf: wider micro-benchmark scenarios, and make the regression check a required check.** Waiting on `plan/reports/performance.md`.

### Phase 2: compatibility fixes (one small PR each; each flips differential cases and passes the perf check)

Details and repro tests: `plan/reports/axios-compat.md` and `plan/prototypes/compat/`. ★ = must-fix for 1.0.

- [ ] ★ **fix(response): decode bodies like axios.** `+json` types, strings for non-binary responses, gzip/br/deflate with `decompress`, `blob`.
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
- [ ] Trim the public API (depends on the decision above), then commit an api-extractor report and check it in CI.
- [ ] HttpService members: `setDispatcher` (rename), internal `setInterceptors`, a real `interceptorCount`, a read-only `undiciRef`.
- [ ] `strict` TypeScript in `tsconfig.build.json` (7 errors).
- [ ] Duplicate undici copy: plain requests should also use an Agent from this package's undici copy.

### Phase 4: performance (waiting on `plan/reports/performance.md`)

- [ ] A fair benchmark app set: one shared app source, `CLIENT=axios|undici`, Express and Fastify, and the same axiosRef interceptor. Drop the upstream `nestjs-undici` app.
- [ ] Hot-path optimizations from the performance report.

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

- 2026-09-25: Explorations done for automation, package quality, axios compatibility and docs (reports in `plan/reports/`). Performance exploration still running. Workers A and B started. Created `claude/v1.0.0` and this plan.
