/**
 * The canonical "retry once on 401" axios interceptor (`_retry` flag on the config).
 * With axios the flag survives on error.config, so the request is sent twice.
 * If config identity/custom props are lost, the interceptor retries forever.
 */
import { firstValueFrom, timeout } from 'rxjs';
import { base, closeModules, pair, recorded, startServer, stopServer } from './harness';

describe('diff: retry-once interceptor pattern', () => {
  beforeAll(startServer);
  afterAll(async () => { await closeModules(); await stopServer(); });

  it('_retry flag on error.config survives the replay', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const ref: any = (s as any).axiosRef;
      let calls = 0;
      ref.interceptors.response.use(undefined, (error: any) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry && ++calls < 20 /* safety cap */) {
          original._retry = true;
          return ref.request(original);
        }
        return Promise.reject(error);
      });
      const before = recorded.length;
      await firstValueFrom((s as any).get(`${base}/raw?status=401`).pipe(timeout(3000))).catch(() => 0);
      out[k] = recorded.length - before;
    }
    expect(out.undici).toEqual(out.axios); // axios: 2
  });
});
