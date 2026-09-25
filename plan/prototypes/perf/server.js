// Keep-alive upstream stub: GET /json, POST /echo (returns small JSON), GET /404.
// Counts TCP connections so keep-alive reuse can be checked (GET /__stats).
const http = require('node:http');
const body = JSON.stringify({ id: 1, name: 'Mock Service Response', data: { status: 'success', message: 'Response from mock service', value: 0.5 } });
let connections = 0, requests = 0, closedEarly = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/__stats') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ connections, requests, closedEarly })); }
  requests++;
  if (req.url.startsWith('/slow')) { req.on('close', () => { if (!res.writableEnded) closedEarly++; }); setTimeout(() => { if (!res.destroyed) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); } }, 2000); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const status = req.url.startsWith('/404') ? 404 : 200;
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
});
server.on('connection', () => connections++);
server.keepAliveTimeout = 60_000;
server.listen(Number(process.env.PORT || 0), '127.0.0.1', () => {
  const port = server.address().port;
  if (process.send) process.send({ port }); else console.log(port);
});
process.on('disconnect', () => server.close(() => process.exit(0)));
