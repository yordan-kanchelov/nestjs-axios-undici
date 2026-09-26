# Upstream conformance suites

These suites check this package's behaviour against the *real, unmodified* test
files of the two projects it's a drop-in replacement for: `@nestjs/axios` and
`axios`. They live under `tests/` (not `plan/prototypes/`, which they replace
- see `plan/reports/upstream-test-suites.md`) because they're runnable,
maintained CI jobs now, not one-off explorations, but under their own
`tests/upstream/` folder rather than plain `tests/*.spec.ts` because Jest's
`testRegex` must never pick up the files they generate or copy from an
upstream clone (see the root `jest.config.js`'s `roots`/`testRegex`, which
only cover `src/` and `tests/` outside `tests/upstream/scripts` themselves;
none of the runner scripts below are named `*.spec.*`/`*.test.*`).

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
failing - see that file's comment for the one bisected, concrete case) as a
regex passed to vitest's `-t`, separate from `expected-failures*.json` since
those tests never run at all.

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
