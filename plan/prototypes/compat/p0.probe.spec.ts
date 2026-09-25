// Ad-hoc probe template: prints both outcomes side by side. `npx jest tests/diff/p0.probe.spec.ts`
import { probe } from './probe';
import * as h from './harness';
it('probe', async () => {
  await probe({
    example: s => s.get(`${h.base}/raw?ct=application/problem%2Bjson&body={"a":1}`),
  }, { serverHeaders: ['content-type', 'accept', 'user-agent'] });
}, 60000);
