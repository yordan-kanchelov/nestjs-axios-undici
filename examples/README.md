# Examples

Runnable examples for `nestjs-axios-undici`. Each one imports the library from `../lib`, so build it first.

| Example | Shows |
|---------|-------|
| [`axios-to-undici-migration.ts`](axios-to-undici-migration.ts) | The same service code running on `@nestjs/axios` and on `nestjs-axios-undici`, with axios options and `axiosRef` interceptors |
| [`axios-compatibility-features.ts`](axios-compatibility-features.ts) | axios options in `register()`, axios-style interceptors, response and error shape, every HTTP method |
| [`interceptors.ts`](interceptors.ts) | Native class-based and function-based interceptors |
| [`axios-headers-example.ts`](axios-headers-example.ts) | The `AxiosHeaders` class |
| [`opentelemetry-integration.ts`](opentelemetry-integration.ts) | Three ways to propagate OpenTelemetry trace context |

## Running

```bash
# All examples, as a test run (builds the library first)
npm run test:examples

# A single example
npm run build
npx ts-node --project examples/tsconfig.json examples/interceptors.ts
```

`npm run test:examples` starts a local echo server and passes its URL to the examples as `EXAMPLES_BASE_URL`, so the run doesn't depend on external hosts. Run on their own, the examples call `https://jsonplaceholder.typicode.com`.

## Adding an example

1. Export a main function and run it when the file is executed directly; exit non-zero on failure:

   ```typescript
   export async function demonstrateFeature() {
     const app = await NestFactory.createApplicationContext(AppModule);
     try {
       // ...
     } finally {
       await app.close();
     }
   }

   if (require.main === module) {
     demonstrateFeature().catch(error => {
       console.error(error);
       process.exit(1);
     });
   }
   ```

2. Use `process.env.EXAMPLES_BASE_URL` for any request URL.
3. Add it to the `examples` list in [`scripts/run-examples.js`](../scripts/run-examples.js).
