---
'nestjs-axios-undici': patch
---

Declare `@nestjs/core` as a peer dependency. `HttpModule` imports `ModuleRef` from it, so the package failed to load when `@nestjs/core` wasn't installed.
