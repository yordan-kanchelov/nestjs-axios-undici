# undici slow-consumer bug: `UND_ERR_SOCKET` "other side closed" on a fully-delivered body

Investigates plan.md phase 2's "investigate: reading a large response body slowly fails
with `UND_ERR_SOCKET` 'other side closed'" item. Root-caused to a real undici bug (not a
test-harness artifact); mitigated in this package for a `Content-Length`-known download
metered by `maxRate`/`onDownloadProgress`
(`src/modules/http/adapters/axios-progress.adapter.ts`'s `meterDownloadBody`) - confirmed
directly against axios' own "should support download rate limit" upstream test, which
reliably reproduced this exact bug and now reliably passes. Documented as a remaining
limitation for a chunked/unknown-length download, and for an unmetered
`responseType: 'stream'` consumer (`docs/axios-supported-options.md`,
`docs/migration-guide.md`).

## Reproduction

Minimal repro, no package code, undici 7.30.0 and 8.11.0 (both `npm ci`'d and `npm i
undici@8.11.0 --no-save` in a scratch dir):

```js
const http = require('http');
const { request, Agent } = require('undici');
const { Writable } = require('stream');

const SIZE = 1_000_000;
const payload = Buffer.alloc(SIZE, 'a');

const server = http.createServer((req, res) => {
  res.setHeader('content-length', req.headers['content-length']);
  req.pipe(res); // echo
});
server.keepAliveTimeout = 5000; // Node's own default; 60000 "succeeds" (see below)

server.listen(0, async () => {
  const port = server.address().port;
  const { body } = await request(`http://127.0.0.1:${port}/`, {
    method: 'POST',
    body: payload,
    headers: { 'content-length': String(SIZE) },
    dispatcher: new Agent(),
  });

  const sink = new Writable({
    highWaterMark: 1024,
    write(chunk, enc, cb) { setTimeout(cb, (chunk.length / (100 * 1024)) * 1000); }, // ~100 KB/s
  });
  body.pipe(sink).on('finish', () => console.log('SUCCESS'));
  body.on('error', (err) => console.log('FAILURE', err.code, err.message));
});
```

Fails at ~9s with `UND_ERR_SOCKET other side closed`. GET (no request body) reproduces
identically. Run with `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy`
(the sandbox's proxy env vars are irrelevant to a loopback request but were unset for every
run below anyway).

**Not a test-harness artifact**: the identical scenario against Node's own `http.request`
(no undici at all) succeeds cleanly, reading the full 1,000,000 bytes at the same throttled
rate, against the same echo server with the same `keepAliveTimeout: 5000` (see
`repro-nodehttp.js` in the scratch dir; kept out of the repo per plan.md - "Reusable
prototypes... go in `plan/prototypes/`", but this one script isn't reused elsewhere so
isn't checked in). So the difference is specifically in undici's h1 client, not in the
scenario itself.

## Root cause

`lib/dispatcher/client-h1.js`'s `onHttpSocketEnd` (undici 7.30.0 and 8.11.0, identical code
in both):

```js
function onHttpSocketEnd () {
  const parser = this[kParser]

  if (parser.statusCode && !parser.shouldKeepAlive) {
    const parserErr = parser.finish()
    if (parserErr) {
      util.destroy(this, parserErr)
    }
    return
  }

  util.destroy(this, new SocketError('other side closed', util.getSocketInfo(this)))
}
```

This runs on the socket's `'end'` event (the peer's FIN, once Node's stream machinery has
drained everything the socket had buffered ahead of it). The graceful branch is meant for a
`Connection: close`, no-`Content-Length` response, where the socket's own EOF *is* the
message terminator (`parser.finish()` tells llhttp "there's no more, wrap up"). For an
ordinary `Content-Length`/keep-alive response (`shouldKeepAlive` true, our case), the
condition is false, so it falls straight through to the **unconditional** "other side
closed" `SocketError` - with no check for whether the message had, in fact, already been
fully received.

That matters because of a race between this event and message completion. The parser
(`Parser.prototype.onBody`, same file) pauses llhttp mid-parse whenever the exposed body
`Readable`'s backpressure rejects a chunk:

```js
onBody (buf) {
  ...
  this.bytesRead += buf.length
  if (request.onData(buf) === false) {
    return constants.ERROR.PAUSED   // <- llhttp stops here, before onMessageComplete
  }
  return 0
}
```

`onMessageComplete()` - the call that would recognize `Content-Length` is satisfied, call
`request.onComplete(headers)`, and (critically) reset `parser.statusCode` back to `0` - only
runs once llhttp is *resumed* and re-executed. A slow consumer (our throttled `Writable`, or
this package's own `maxRate`/`onDownloadProgress` throttle - see below) leaves the parser
paused like this for nearly the entire transfer, since `readMore()`'s `while (!this.paused
...)` loop stops pulling more from the socket every time the exposed stream's buffer is full.

So: the raw TCP bytes (including the peer's FIN) are typically already sitting in the
client's own kernel/`net.Socket` buffers almost immediately - it's loopback, and the server
already handed the whole write to the OS quickly (`res.on('finish')` fires in ~10ms in the
repro, regardless of `keepAliveTimeout`). What's genuinely slow is only how fast userland
*drains* that buffer, gated by `readMore()`'s backpressure check. When userland finally
catches up to the very last already-buffered byte - which, for our scenario, is also the
byte that satisfies `Content-Length` - two things can happen in either order:

- **Fast/no-backpressure case (`keepAliveTimeout: 60000`, or a fast consumer even with a
  short `keepAliveTimeout`):** `execute()` parses that last chunk, llhttp completes the
  message synchronously (`onMessageComplete` runs, resets `parser.statusCode = 0`), *then*
  the socket's `'end'` event fires later (if at all) with `parser.statusCode` already `0` -
  `onHttpSocketEnd`'s check is moot, no request is pending, nothing errors. Confirmed with
  instrumentation: `onMessageComplete` logged with `socket.destroyed=false` before the
  server ever closed anything.

- **Slow-consumer case (the bug):** the parser is *paused* (backpressure) exactly at the
  point the last body byte would complete the message, so `onMessageComplete` hasn't run
  yet - `parser.statusCode` is still `200` (not yet reset) and `parser.paused` is `true`.
  Meanwhile the socket's `'end'` event (deferred to a later tick, once Node's stream
  internals see EOF) fires *first*, hits the non-`shouldKeepAlive` check with a still-set
  `statusCode`, and takes the "other side closed" branch - destroying the socket and,
  through `onHttpSocketClose`'s `client[kRunning] > 0` path, failing the still-pending
  request/response with `UND_ERR_SOCKET`, even though every `Content-Length` byte had
  already been read from the socket.

Confirmed directly by patching `client-h1.js` with temporary `console.error`s (not
committed; scratch-only) around both functions and re-running the repro:

```
[DEBUG onHttpSocketEnd] parser.statusCode=200 parser.shouldKeepAlive=true parser.bytesRead=1000000
[main] FAILURE ... received=980389: UND_ERR_SOCKET: other side closed
```

`parser.bytesRead` (1,000,000) already exactly matches `Content-Length`; `onMessageComplete`
never logged at all for this run. For the successful runs (`keepAliveTimeout: 60000`, or a
fast 10 MB/s consumer even with `keepAliveTimeout: 1000`), `onMessageComplete` *did* log,
with `socket.destroyed=false`, before anything closed.

This also explains the task's stated observation that the failure time is the same
(~9.2s) regardless of `keepAliveTimeout` (1s vs. 5s): the server-side socket close (visible
in the repro's own logs, e.g. `+2011ms` for `keepAliveTimeout: 1000` vs. `+6011ms` for
`keepAliveTimeout: 5000`) happens well before the failure either way - it isn't itself the
trigger. What actually determines the failure time is purely how long the *consumer* takes
to drain the buffered body down to the last byte (`SIZE / rate` ≈ 1,000,000 / 102,400 ≈
9.77s here), because that's when the parser's pause/resume cycle finally reaches the FIN.

**Ruled out** (per the task's candidate list):
- Server request/headers-timeout interplay: `server.requestTimeout`/`headersTimeout` play no
  part - the request finished (server-side) in ~10ms in every run; `requestTimeout` never
  came close to firing.
- undici's own `keepAliveTimeout`/`bodyTimeout` client options: not implicated - the
  `Parser`'s `TIMEOUT_BODY` timer is refreshed on every `onBody` call and never fires here
  (failure isn't a timeout error, it's `UND_ERR_SOCKET`).
  `keepAliveTimeout=` response-header hint parsing: not implicated either (this server
  doesn't send one; the client-side `Agent`'s own `keepAliveTimeout` option was varied with
  no effect on the failure).
- Pipelining: not implicated (default `pipelining: 1`, single in-flight request per
  connection throughout).
- GET vs. POST echo: identical failure mode either way (`repro.js ... GET` in the scratch
  dir) - it isn't specific to echoing an uploaded body.

## Versions

- undici 7.30.0 (this repo's pinned `dependencies.undici`) and 8.11.0 (`npm i
  undici@8.11.0 --no-save` in a scratch dir) - byte-for-byte identical
  `onHttpSocketEnd`/`onBody`/`onMessageComplete` code in both, identical failure.
- Node.js: the sandbox's Node 22 (`node -v` → v22.22.2 at the time of this investigation).
- Not yet checked against undici's `main`/an unreleased version - out of scope for this
  time-boxed investigation; worth checking if/when filing upstream.

## Decision: (b) for a `Content-Length`-known download metered by `maxRate`/`onDownloadProgress` (fixed, confirmed against the real upstream test), plus (a) - the underlying issue is still undici's to fix, and (c) is ruled out

This is squarely an undici bug (see "not a test-harness artifact" above), so strictly it's
case (a). It is not filed on undici's GitHub - the owner will, using the repro and analysis
above (title suggestion: **"h1 client: a fully Content-Length-delivered body can still
error with `UND_ERR_SOCKET`/'other side closed' if the parser is paused on backpressure
when the peer's FIN is processed"**; suspected fix location: `onHttpSocketEnd` in
`lib/dispatcher/client-h1.js` should check whether the message was already fully received
- e.g. `parser.bytesRead === parser.contentLength` - or `parser.paused` with content-length
satisfied, not just `parser.statusCode`/`shouldKeepAlive`, before treating the socket's
`'end'` as a protocol violation. Alternatively/additionally, `Parser.prototype.resume()`'s
own body-drain path could give a paused-at-completion parser a chance to run
`onMessageComplete` before an already-queued `'end'` event is handled).

Since this package's own `maxRate`/`onDownloadProgress` (`meterDownloadBody`,
`src/modules/http/adapters/axios-progress.adapter.ts`) is exactly the kind of deliberate,
sustained slow consumer that reliably opens this race (that's precisely how the axios
upstream conformance test - "should support download rate limit" - found it: `maxRate`
throttling is what turns a normally-instant local transfer into a multi-second one, giving
the server's - there, a 1s - `keepAliveTimeout` time to fire mid-transfer), this package
takes mitigation (b) for a `Content-Length`-known download metered this way, in two
complementary steps in `meterDownloadBody`:

1. **Root cause, not just the symptom.** The first attempt at this fix only listened for
   the raw body's `'error'` event (replacing `stream.pipeline()`, whose automatic
   error-forwarding would destroy the metered stream before a check could run) and turned
   `UND_ERR_SOCKET` into a normal end when every promised (`Content-Length`) byte had
   already been *forwarded* (`meter.bytesSeen >= total`). **This measurably helped but did
   not reliably fix the real test**: `meter.bytesSeen` is itself paced by
   `maxRate`/`onDownloadProgress`'s own throttling, so at the moment the race actually
   fires - which, for a `maxRate`-throttled download, is tied to almost the same wall-clock
   duration as the throttle's own pacing - it had typically *not* yet caught up to `total`
   either (confirmed directly: re-running axios' own test against this first version still
   failed, with the error's own diagnostics showing `bytesRead: 1000128` - the *raw* undici
   socket already had the complete body - while our own `bytesSeen` lagged behind it).
   Fixed by attacking the actual trigger instead: `body` (the raw undici stream) is now
   drained via a `'data'` listener rather than `.pipe()`d, so undici's own parser is never
   left paused on *our* backpressure - it's never given the chance to still be paused when
   the peer's FIN is processed. Only `meter`'s own throttled/paced *output* stays
   backpressured, exactly as intended. The trade-off: a `Content-Length`-known download
   metered this way can now sit fully in `meter`'s internal buffer ahead of a slow
   `maxRate`/consumer, up to `total` bytes - bounded by the response's own advertised size,
   and no worse than what a *buffered* `responseType` (`json`/`text`/`arraybuffer`/`blob`)
   already pays regardless of `maxRate` (this is exactly what the failing upstream test
   uses - `responseType: 'text'` - so for it specifically there is no new memory cost at
   all). `maxContentLength`'s own streamed enforcement sits in front of this unaffected (it
   still destroys `body` the instant its limit is crossed - if anything, promptly *faster*
   now).
2. **Belt-and-suspenders.** (1) makes the race far less likely but not impossible (e.g. one
   final chunk large enough to satisfy `Content-Length` and race the socket's `'end'` before
   `meter.write()` is even called), so `body`'s `'error'` is still checked directly, exactly
   as the first attempt did: `err.code === 'UND_ERR_SOCKET'` and `meter.bytesSeen >= total`
   together turn it into a normal end instead of an error.

A response with no `Content-Length` (chunked/unknown length) has no safe bound on how much
this could ever buffer, so neither step applies - it keeps today's plain, backpressured
`.pipe()` (and stays exposed to the race). A plain `responseType: 'stream'` consumer with
neither `maxRate` nor `onDownloadProgress` set (the raw undici body handed straight to the
caller, never wrapped) isn't covered either - fixing that generically would mean shipping
our own default dispatcher/parser behaviour to paper over an upstream framing bug, a much
bigger surface than this narrow, already-opt-in path. Both are documented as known
limitations with a workaround (raise the server's `keepAliveTimeout`, or drain the stream
faster) in `docs/axios-supported-options.md` (near `maxRate`/`responseType: 'stream'`) and
`docs/migration-guide.md`.

**Verification.** Unit tests:
`src/modules/http/adapters/__tests__/axios-progress.adapter.spec.ts` ("undici slow-consumer
mitigation (UND_ERR_SOCKET)") - a fully-delivered body swallows the error and ends normally;
a body short of `Content-Length` still errors; a different error code is never swallowed; a
response with no `Content-Length` never swallows the error either.

Real-world confirmation, directly against axios' own test (not just a synthetic unit test):
axios v1.20.0's `tests/unit/adapters/http.test.js` "should support download rate limit" is
exactly this bug's real-world trigger (`tests/setup/server.js`'s fixture defaults
`keepAliveTimeout` to **1000ms**; the test throttles a 1MB POST-echo download to
100,000 bytes/sec over ~10s, `responseType: 'text'`) - it failed with this exact
`UND_ERR_SOCKET`/`other side closed` both in the full conformance run and when isolated,
before this fix, and **passes reliably after it** (3 repeated isolated runs, each ~9-11s,
all green) - run directly against the built `lib/`, through the same
`axiosref-instance.mjs` shim strategy (a) uses:

```bash
npm run build
cd /tmp/conformance-clones/axios-v1.20.0
CONFORMANCE_LIB_DIR=<repo>/lib/modules/http CONFORMANCE_REPO_LIB=<repo>/lib/index.js \
  node_modules/.bin/vitest run --config .conformance-a.vitest.config.mjs \
  -t "should support download rate limit"
```

`tests/upstream/axios/expected-failures.strategy-a.json`'s "should support download rate
limit" entry is **removed** (it now really passes - the task's own bar for removing an
entry). Note: a full `node tests/upstream/axios/run.mjs --strategy a` run's own
chunking/timeout logic (`CHUNK_TIMEOUT_MS`/`STRATEGY_DEADLINE_MS` in `run.mjs`, splitting an
overrun chunk and retrying) can still occasionally fail to evaluate this specific ~10s test
at all under time pressure from neighbouring slow tests in the same file (observed once,
independent of this fix - see that run's own "stale entry" bookkeeping) - a pre-existing
harness characteristic for this file's genuinely slow tests, not something this fix changes
either way; the isolated, repeated runs above are the reliable signal.

Strategy (b) (`expected-failures.strategy-b.json`) keeps its own, unrelated entry for the
same test name: its bare `undici-adapter.cjs` never wires up
`maxRate`/`onDownloadProgress`/`meterDownloadBody` at all (bypassing `HttpService` entirely,
by design - see that file's own comment), so this fix doesn't reach it either way; left
alone.

## Perf

`meterDownloadBody` only runs when `maxRate`/`onDownloadProgress` is actually set (same
gating as before this change - see `axios-response.adapter.ts`); a plain request never
touches this code path, so `benchmarks/micro/compare.js`'s hot path is unaffected.
