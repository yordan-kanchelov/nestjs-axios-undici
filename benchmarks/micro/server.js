// Upstream stub for the micro-benchmark: a keep-alive JSON endpoint.
// Runs in its own process so it doesn't compete with the client's event loop.
const http = require('node:http');

const body = JSON.stringify({
  id: 1,
  name: 'Mock Service Response',
  data: { status: 'success', message: 'Response from mock service', value: 0.5 },
});

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
});
server.keepAliveTimeout = 60_000;
server.listen(0, '127.0.0.1', () => {
  process.send?.({ port: server.address().port });
});
process.on('disconnect', () => server.close(() => process.exit(0)));
