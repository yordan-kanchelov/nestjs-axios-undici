---
'nestjs-axios-undici': patch
---

Lower CPU per request by making `response.config` and `error.config` build only when read. Both used to build a full axios-shaped config object, including an `AxiosHeaders` instance, on every request and every error, even when nothing ever reads `.config`. `config` is still an own, enumerable property once read, so it still survives `{ ...response }`, `JSON.stringify`, and `structuredClone`.
