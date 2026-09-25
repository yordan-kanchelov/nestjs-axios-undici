/**
 * Popular axios plugins applied to `httpService.axiosRef` (common in NestJS apps).
 */
import axiosRetry from 'axios-retry';
import MockAdapter from 'axios-mock-adapter';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import { firstValueFrom } from 'rxjs';
import { base, closeModules, outcome, pair, recorded, startServer, stopServer } from './harness';

describe('diff: axios ecosystem plugins on axiosRef', () => {
  beforeAll(startServer);
  afterAll(async () => {
    await closeModules();
    await stopServer();
  });

  it('axios-retry retries 5xx', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const before = recorded.length;
      let err: any;
      try {
        axiosRetry((s as any).axiosRef, { retries: 2, retryDelay: () => 10 });
        await firstValueFrom((s as any).get(`${base}/raw?status=503`)).catch(e => (err = e));
      } catch (e: any) {
        err = e;
      }
      out[k] = { requests: recorded.length - before, code: err?.code, status: err?.response?.status, retryCount: err?.config?.['axios-retry']?.retryCount };
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('axios-mock-adapter intercepts requests', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const before = recorded.length;
      try {
        const mock = new MockAdapter((s as any).axiosRef);
        mock.onGet('/users').reply(200, [{ id: 1 }]);
        out[k] = { res: await outcome((s as any).get('/users')), network: recorded.length - before };
      } catch (e: any) {
        out[k] = { threw: e.message };
      }
    }
    expect(out.undici).toEqual(out.axios);
  });

  it('axios-auth-refresh refreshes on 401 and replays', async () => {
    const p = await pair();
    const out: any = {};
    for (const [k, s] of [['axios', p.a], ['undici', p.u]] as const) {
      const before = recorded.length;
      try {
        let token = 'old';
        (s as any).axiosRef.interceptors.request.use((c: any) => { c.headers.Authorization = token; return c; });
        createAuthRefreshInterceptor((s as any).axiosRef, async (failed: any) => {
          token = 'new';
          failed.response.config.headers.Authorization = token;
          failed.response.config.url = `${base}/echo/replayed`;
        });
        const r = await outcome((s as any).get(`${base}/raw?status=401`));
        out[k] = { ok: r.ok, requests: recorded.slice(before).map(x => [x.url, x.headers.authorization]) };
      } catch (e: any) {
        out[k] = { threw: e.message };
      }
    }
    expect(out.undici).toEqual(out.axios);
  });
});
