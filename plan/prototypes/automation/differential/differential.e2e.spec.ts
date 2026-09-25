import { differential, summarizeError } from './differential-harness';

const json = (res: any, status: number, body: unknown, headers: Record<string, any> = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
};

differential('Differential: @nestjs/axios vs nestjs-axios-undici (gaps probe)', {
  '/r302': (_q, res) => { res.writeHead(302, { Location: '/landing' }); res.end(); },
  '/r303': (_q, res) => { res.writeHead(303, { Location: '/landing' }); res.end(); },
  '/r307': (_q, res) => { res.writeHead(307, { Location: '/landing' }); res.end(); },
  '/cross': (_q, res, _b, ctx) => { res.writeHead(302, { Location: `${ctx.other}/landing` }); res.end(); },
  '/loop': (_q, res) => { res.writeHead(302, { Location: '/loop' }); res.end(); },
  '/cookies': (_q, res) => json(res, 200, {}, { 'Set-Cookie': ['a=1; Path=/', 'b=2; Path=/'] }),
  '/big': (_q, res) => json(res, 200, { big: 'x'.repeat(5000) }),
  '/e500text': (_q, res) => { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('boom'); },
  '/e401': (_q, res) => json(res, 401, { error: 'unauthorized' }),
  '/slow': (_q, res) => { const t = setTimeout(() => json(res, 200, {}), 3000); res.on('close', () => clearTimeout(t)); },
  '/hang-body': (_q, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.write('partial'); const t = setTimeout(() => res.end(), 3000); res.on('close', () => clearTimeout(t)); },
}, [
  // HttpService surface
  { name: 'putForm(FormData)', run: s => { const f = new FormData(); f.append('k', 'v'); return s.putForm(`/echo`, f, { baseURL: '' }); },
    normalize: o => ({ method: o.requests[0]?.method, multipart: /multipart/.test(o.requests[0]?.headers['content-type']), err: o.error?.message }) },
  { name: 'patchForm(URLSearchParams)', run: (s, c) => s.patchForm(`${c.base}/echo`, new URLSearchParams({ a: '1' })) },
  { name: 'HttpService.query(url, data) (@nestjs/axios >= 12)', skipIf: r => typeof r.query !== 'function',
    run: (s, c) => s.query(`${c.base}/echo`, { q: 1 }) },
  { name: 'cold observable: subscribing twice sends two requests', run: async (s, c) => {
      const o = s.get(`${c.base}/echo`); await new Promise(r => o.subscribe({ complete: r, error: r })); await new Promise(r => o.subscribe({ complete: r, error: r })); return { n: c.seen.length };
    }, normalize: o => o.result },
  // axiosRef surface
  { name: 'axiosRef.getUri', run: (s, c) => s.axiosRef.getUri({ url: '/a', baseURL: c.base, params: { q: 1 } }), normalize: (o, c) => o.result?.replace(c.base, '') ?? String(o.error) },
  { name: 'axiosRef(config) callable', run: (s, c) => s.axiosRef({ url: `${c.base}/echo` }), normalize: o => o.result?.status ?? String(o.error).slice(0, 40) },
  { name: 'axiosRef.postForm', run: (s, c) => s.axiosRef.postForm(`${c.base}/echo`, new URLSearchParams({ a: '1' })) },
  { name: 'axiosRef.defaults.timeout applies', run: (s, c) => { s.axiosRef.defaults.timeout = 200; return s.get(`${c.base}/slow`); } },
  { name: 'axiosRef.defaults.baseURL applies', run: (s, c) => { s.axiosRef.defaults.baseURL = c.base; return s.get('/echo'); } },
  { name: 'response interceptor onRejected recovers a 401 (retry pattern)', run: (s, c) => {
      s.axiosRef.interceptors.response.use(undefined, (e: any) => e.response?.status === 401 ? s.axiosRef.get(`${c.base}/ok`) : Promise.reject(e));
      return s.get(`${c.base}/e401`); } },
  { name: 'request interceptor throwing rejects the call', run: (s, c) => { s.axiosRef.interceptors.request.use(() => { throw new Error('nope'); }); return s.get(`${c.base}/echo`); },
    normalize: o => ({ requests: o.requests.length, message: o.error?.message }) },
  // Redirects
  { name: 'POST + 302 => GET without body', module: () => ({ maxRedirects: 5 }), run: (s, c) => s.post(`${c.base}/r302`, { a: 1 }) },
  { name: 'POST + 303 => GET', module: () => ({ maxRedirects: 5 }), run: (s, c) => s.post(`${c.base}/r303`, { a: 1 }) },
  { name: 'POST + 307 keeps method and body', module: () => ({ maxRedirects: 5 }), run: (s, c) => s.post(`${c.base}/r307`, { a: 1 }) },
  { name: 'cross-origin redirect drops Authorization', module: () => ({ maxRedirects: 5 }), run: (s, c) => s.get(`${c.base}/cross`, { headers: { Authorization: 'Bearer secret' } }) },
  { name: 'redirect loop hits maxRedirects', module: () => ({ maxRedirects: 3 }), run: (s, c) => s.get(`${c.base}/loop`), normalize: o => ({ code: o.error?.code, n: o.requests.length }) },
  { name: 'default redirect following (no maxRedirects)', run: (s, c) => s.get(`${c.base}/r302`) },
  // Response / errors
  { name: 'multiple Set-Cookie headers are an array', run: (s, c) => s.get(`${c.base}/cookies`) },
  { name: 'non-JSON 500 error body', run: (s, c) => s.get(`${c.base}/e500text`) },
  { name: 'validateStatus: null accepts everything', run: (s, c) => s.get(`${c.base}/e401`, { validateStatus: null }) },
  { name: 'maxContentLength exceeded', run: (s, c) => s.get(`${c.base}/big`, { maxContentLength: 100 }), normalize: o => ({ code: o.error?.code, message: o.error?.message }) },
  { name: 'maxContentLength exceeded (module option)', module: () => ({ maxContentLength: 100 }), run: (s, c) => s.get(`${c.base}/big`), normalize: o => ({ code: o.error?.code, message: o.error?.message }) },
  { name: 'maxBodyLength exceeded (module option)', module: () => ({ maxBodyLength: 10 }), run: (s, c) => s.post(`${c.base}/echo`, { a: 'x'.repeat(100) }), normalize: o => ({ code: o.error?.code, sent: o.requests.length }) },
  { name: 'timeoutErrorMessage', run: (s, c) => s.get(`${c.base}/slow`, { timeout: 200, timeoutErrorMessage: 'custom' }), normalize: o => summarizeError(o.error) },
  { name: 'transitional.clarifyTimeoutError => ETIMEDOUT', run: (s, c) => s.get(`${c.base}/slow`, { timeout: 200, transitional: { clarifyTimeoutError: true } }), normalize: o => o.error?.code },
  { name: 'timeout while streaming the body', run: (s, c) => s.get(`${c.base}/hang-body`, { timeout: 500 }), normalize: o => o.error?.code ?? 'no error' },
  { name: 'default request headers (Accept, User-Agent family)', run: (s, c) => s.get(`${c.base}/echo`),
    normalize: o => ({ accept: o.requests[0]?.headers.accept, ua: String(o.requests[0]?.headers['user-agent']).split('/')[0] }) },
  { name: 'data: null / undefined sends no Content-Type', run: (s, c) => s.post(`${c.base}/echo`, null) },
  { name: 'header with undefined value is dropped', run: (s, c) => s.get(`${c.base}/echo`, { headers: { 'X-A': undefined, 'X-B': 1 } }) },
  { name: 'module headers merge case-insensitively with request headers', module: () => ({ headers: { 'x-a': 'module' } }), run: (s, c) => s.get(`${c.base}/echo`, { headers: { 'X-A': 'request' } }) },
  { name: 'absolute url ignores baseURL', module: () => ({ baseURL: 'http://127.0.0.1:1/api' }), run: (s, c) => s.get(`${c.base}/echo`) },
  { name: 'response.request is set', run: (s, c) => s.get(`${c.base}/echo`), normalize: o => ({ hasRequest: !!o.result?.request }) },
  { name: 'onDownloadProgress is called', run: async (s, c) => { let n = 0; await s.axiosRef.get(`${c.base}/big`, { onDownloadProgress: () => n++ }); return n > 0; }, normalize: o => o.result },
]);
