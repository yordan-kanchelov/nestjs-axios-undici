# Upstream conformance suites

These suites check this package's behaviour against the *real, unmodified* test
files of the two projects it's a drop-in replacement for: `@nestjs/axios` and
`axios`. They live under `tests/` (not `plan/prototypes/`, which they replace
- see `plan/reports/upstream-test-suites.md`) because they're runnable,
maintained CI jobs now, not one-off explorations, but under their own
`tests/upstream/` folder rather than plain `tests/*.spec.ts` because Jest's
`testRegex` (`(/__tests__/.*|(\.|/)(test|spec))\.(t|j)s$`, in the root
`jest.config.js`) must never pick up a spec file this suite copies out of an
upstream clone at run time - none of the files below are named
`*.spec.*`/`*.test.*` themselves, so `npm run test:jest` never sees them.

## What runs, and why two axios strategies

- **`nestjs-axios/`**: `@nestjs/axios`'s own `tests/http.service.spec.ts` and
  `tests/http.module.spec.ts` (vitest originals), run unmodified through this
  repo's Jest with a `moduleNameMapper` shim pointing `../lib/index.js` /
  `../lib/http.constants.js` at this package's built `HttpModule`/
  `HttpService`. `tests/esm.spec.ts` is intentionally not copied: it only
  checks `@nestjs/axios`'s own packaging, not shared behaviour.
- **`axios/`**: axios' `tests/unit/adapters/http.test.js`, run unmodified
  through axios' own vitest, under two strategies:
  - **(a) axiosRef as the instance** (`adapters/axiosref-instance.mjs`):
    aliases the test file's `import axios from '../../../index.js'` to
    `new HttpService({}, {}).axiosRef` - the object a real consumer of this
    package gets from `httpService.axiosRef`. Exercises axiosRef's
    interceptor chain and config normalization.
  - **(b) our transport as an axios `adapter`** (`adapters/undici-adapter.cjs`):
    a small `axios.defaults.adapter` function built from this package's own
    response/error/redirect code (`lib/modules/http/adapters/*`,
    `lib/modules/http/errors/*`). Narrower - it bypasses axiosRef's
    interceptor/config-normalization pipeline entirely - but cheap (no DI, no
    interceptor setup) and still catches real transport/response/error bugs,
    as documented in `plan/reports/upstream-test-suites.md`.

Both projects are cloned at a pinned tag at run time into a temp/cache
directory (`--clone-dir`, defaulting under `os.tmpdir()`), never vendored.

## Expected failures

Each suite/strategy has an `expected-failures*.json`: `{ "<test full
name>": "<reason>" }`. A reason is either a `plan.md` item (something still
to fix) or one of `deliberate difference` / `Node http-specific` /
`harness limitation` (see each file for specifics). The runner
(`tests/upstream/lib/conformance.mjs`) diffs the actual pass/fail set against
this list on every run, the same `knownDifference` discipline
`tests/compat/differential/harness.ts` uses:

- an expected failure that still fails: fine, silently counted.
- an expected failure that now **passes**: the run **fails** ("remove it from
  the list" - the underlying fix landed).
- a failure **not** on the list: the run **fails** (a new regression).
- an expected-failures entry for a test the suite no longer even runs (e.g. a
  rename after bumping the pinned tag): the run **fails** (a stale entry).

A short summary (passed / expected failures / new failures / fixed) is
printed to the console and appended to `$GITHUB_STEP_SUMMARY` in CI.

`tests/upstream/axios/run.mjs` also keeps a small `HARD_EXCLUDES` list (tests
that must never even start, e.g. because they hang the whole file rather than
failing - see that file's comment for each bisected, concrete case) as a
filter passed to vitest's `-t`, separate from `expected-failures*.json` since
those tests never run at all.

## Keeping the axios suite from hanging

A full, unfiltered run of axios' `tests/unit/adapters/http.test.js` hung early
when first prototyped (see `plan/reports/upstream-test-suites.md`). Bisecting
it found two real causes, both fixed here (not in `src/`):

- Upstream's own fixture (`tests/setup/server.js`, not modified) calls
  `server.listen(port, callback)` and only ever invokes `callback` on success
  - a bind failure (`EADDRINUSE`) has no way to reach it. Around 200 of this
    file's tests share one fixed port; if a previous test's socket hadn't
    fully released it yet, the next one could hang forever waiting for a
    callback that was never coming. `adapters/ephemeral-ports.cjs` patches
    `net.Server.prototype.listen` to swap that fixture's fixed ports for `0`
    (an OS-assigned one) transparently - every test reads the real bound port
    back off `server.address().port` anyway, except one that hardcodes the
    literal port number in a redirect `Location` header, listed as an
    expected failure instead of fixed.
- An undrained response body on a `buildRedirectHop` security-check failure
  (a thrown `beforeRedirect`, a cross-origin header-stripping check) leaked
  its connection; fixed in `adapters/undici-adapter.cjs` by draining the body
  on that path too, matching `HttpService.executeRequest`.

Even so, this specific (heavily shared, contended) sandbox occasionally still
needs a retry for reasons not fully pinned down beyond "socket-level timing
under load" - a real, dedicated CI runner is expected to need this far less.
`run.mjs` runs the file across several vitest processes instead of one (a
fresh process reclaims the OS port instantly on exit, unlike the graceful,
in-process `server.close()` the fixture's own cleanup relies on), and
recursively splits and retries any chunk that doesn't produce a report, down
to one test at a time, bounded by a per-strategy wall-clock deadline
(`STRATEGY_DEADLINE_MS`) so a bad run degrades to "some tests reported as
failed, not evaluated" rather than hanging the whole job.

## Licence

`@nestjs/axios` and `axios` are both MIT licensed. This package clones them at
run time and doesn't vendor a copy; running their own, unmodified test files
against a different implementation under test is within the scope MIT's
permissions grant regardless, but as a courtesy: **`@nestjs/axios`** is
Copyright (c) Nest, MIT licensed
(https://github.com/nestjs/axios/blob/master/LICENSE); **`axios`** is
Copyright (c) 2014-present Matt Zabriskie & axios Contributors, MIT licensed
(https://github.com/axios/axios/blob/main/LICENSE).

## Running locally

```bash
npm run test:upstream          # both suites
npm run test:upstream:nestjs   # just @nestjs/axios
npm run test:upstream:axios    # just axios (both strategies)
```

Each `run.mjs` also runs standalone with its own flags (`--ref`, `--keep`,
`--clone-dir`, `--skip-build`; `axios/run.mjs` also takes `--strategy a|b|both`)
- see each file's header comment. Run with the proxy env vars (`HTTP_PROXY`/
`HTTPS_PROXY`) unset: the suites start real local `node:http` servers, and a
proxy in front of `localhost` traffic breaks them.

## Bumping a pinned tag

Bump `--ref`'s default in `nestjs-axios/run.mjs` or `axios/run.mjs` together
with this repo's matching devDependency (`@nestjs/axios` / `axios` in
`package.json`), then run the suite: a new upstream release can rename or add
tests, which the stale-entry check above will catch as a failure pointing at
exactly what changed.
