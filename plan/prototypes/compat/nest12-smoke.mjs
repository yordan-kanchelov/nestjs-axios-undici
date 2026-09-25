import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import * as A from '@nestjs/axios';
import * as U from 'nestjs-axios-undici';
import { createServer } from 'node:http';
import { firstValueFrom } from 'rxjs';
const srv = createServer((req, res) => { let b=''; req.on('data', c => b += c); req.on('end', () => { res.setHeader('content-type','application/json'); res.end(JSON.stringify({ m: req.method, u: req.url, b })); }); });
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
const ma = await Test.createTestingModule({ imports: [A.HttpModule.register({ baseURL: base })] }).compile();
const mu = await Test.createTestingModule({ imports: [U.HttpModule.register({ baseURL: base })] }).compile();
const a = ma.get(A.HttpService), u = mu.get(U.HttpService);
console.log('axios get', (await firstValueFrom(a.get('/x'))).data);
console.log('undici get', (await firstValueFrom(u.get('/x'))).data);
console.log('axios query', (await firstValueFrom(a.query('/q', { a: 1 }))).data);
console.log('undici query', typeof u.query);
try { console.log('undici request QUERY', (await firstValueFrom(u.request({ url: '/q', method: 'QUERY', data: { a: 1 } }))).data); } catch (e) { console.log('undici QUERY err', e.message); }
await ma.close(); await mu.close(); srv.close();
