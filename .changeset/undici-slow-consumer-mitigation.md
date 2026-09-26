---
'nestjs-axios-undici': minor
---

Fixed a bug where `maxRate`/`onDownloadProgress` on a download with a known `Content-Length` could fail with `UND_ERR_SOCKET`/"other side closed" even though the full response body had actually been delivered, against a server with a short `keepAliveTimeout` (Node's own default is 5s). Root cause: an undici h1-client bug (see `plan/reports/undici-slow-consumer.md`) where throttling/backpressuring the response body left undici's parser paused for long enough that the server's keep-alive timeout could race the parser's own message-completion handling. Fixed by draining the raw response as fast as undici delivers it (bounded by the response's own `Content-Length`, so no worse than what a buffered `responseType` already holds in memory) and only pacing the *output* side that `maxRate`/`onDownloadProgress` actually throttles; a belt-and-suspenders check also turns an already-fully-delivered body's `UND_ERR_SOCKET` into a normal end, for the rare case the race still occurs.

A chunked/unknown-length response, and a plain `responseType: 'stream'` consumer with neither `maxRate` nor `onDownloadProgress` set, are still exposed to the underlying undici bug - documented as a known limitation, with a workaround, in `docs/axios-supported-options.md` and `docs/migration-guide.md`.
