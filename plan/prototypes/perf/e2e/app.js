// Minimal NestJS (Fastify) app, identical for both clients except the import -- the "drop-in" claim.
// node app.js --client nau|axios --port 3100 --upstream http://127.0.0.1:3099/api/data [--interceptor]
// GET /api fans out 5 parallel upstream GETs and returns their parsed bodies (same shape as benchmarks/apps).
require('reflect-metadata');
const { Module, Controller, Get, Injectable, Inject } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { firstValueFrom } = require('rxjs');
const args = Object.fromEntries(process.argv.slice(2).reduce((p, a, i, all) => (a.startsWith('--') ? [...p, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]] : p), []));
const { HttpModule, HttpService } = args.client === 'nau' ? require(process.env.NAU_LIB || 'nestjs-axios-undici') : require('@nestjs/axios');
const upstream = args.upstream;

class AppController {
  constructor(http) {
    this.http = http;
    if (args.interceptor) {
      // Same user code on both sides: axiosRef request + response interceptor (no logging, so we measure the client, not stdout).
      http.axiosRef.interceptors.request.use((config) => { config.headers['x-request-start'] = String(Date.now()); return config; });
      http.axiosRef.interceptors.response.use((response) => { response.headers['x-duration'] = '0'; return response; });
    }
  }
  async get() {
    const results = await Promise.all(Array.from({ length: 5 }, () => firstValueFrom(this.http.get(upstream))));
    return { data: results.map((r) => r.data) };
  }
}
Inject(HttpService)(AppController, undefined, 0);
Controller('api')(AppController);
Get()(AppController.prototype, 'get', Object.getOwnPropertyDescriptor(AppController.prototype, 'get'));
class AppModule {}
Module({ imports: [HttpModule.register({})], controllers: [AppController] })(AppModule);

(async () => {
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false });
  await app.listen(Number(args.port), '127.0.0.1');
  process.send?.('ready');
})();
