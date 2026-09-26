---
'nestjs-axios-undici': patch
---

Lower CPU per request by building `response.config` and `error.config` only when read. Both used to build a full axios-shaped config object, including an `AxiosHeaders` instance, on every request and every error. The fields `config` shows are still copied when the response or error is created, so later changes to the request object don't show up in it. `config` is still an own, enumerable property, so `{ ...response }` and `JSON.stringify` keep it.
