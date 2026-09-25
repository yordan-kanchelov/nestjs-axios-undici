// Upstream stub without request logging (the Docker mock logs every request, which can cap throughput).
const http = require('node:http');
const body = JSON.stringify({ id: 1, name: 'Mock Service Response', timestamp: new Date().toISOString(), data: { status: 'success', message: 'Response from mock service', value: 0.5 } });
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) }); res.end(body); });
server.keepAliveTimeout = 60_000;
server.listen(Number(process.argv[2]), '127.0.0.1', () => process.send?.('ready'));
