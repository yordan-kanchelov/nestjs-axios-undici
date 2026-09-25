import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';

export interface JsonServer {
  baseUrl: string;
  close(): Promise<void>;
}

/**
 * Starts a local HTTP server that answers every request with
 * `{ id: 1, title: 'hello', path, method }` as JSON, so e2e tests
 * don't depend on external hosts. `onRequest` sees each incoming request.
 */
export async function startJsonServer(
  onRequest?: (req: IncomingMessage) => void,
): Promise<JsonServer> {
  const server: Server = createServer((req, res) => {
    onRequest?.(req);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        id: 1,
        title: 'hello',
        path: req.url,
        method: req.method,
      }),
    );
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Returns a local URL with nothing listening on it (requests fail with ECONNREFUSED). */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
