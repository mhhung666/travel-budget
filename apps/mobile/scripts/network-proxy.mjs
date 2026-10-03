import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';

/** Disposable loopback transport faults. Never mounted in the application/backend. */
export async function startNetworkProxy(apiUrl, port, observe = () => {}) {
  const api = new URL(apiUrl);
  assert(
    api.protocol === 'http:' && api.hostname === '127.0.0.1' && api.pathname === '/api/v1',
    'Network acceptance requires the disposable loopback API'
  );
  const token = randomBytes(32).toString('hex');
  let mode = 'online';
  const counts = { forwarded: 0, disconnect: 0, timeout: 0 };
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.url.startsWith('/__network/')) {
      if (req.headers.authorization !== `Bearer ${token}`) return reply(401, {});
      const command = req.url.slice('/__network/'.length);
      if (req.method !== 'POST') return reply(405, {});
      if (!['online', 'disconnect', 'timeout'].includes(command)) return reply(404, {});
      mode = command;
      return reply(200, { mode });
    }
    if (!/^\/api\/v1\//.test(req.url)) return reply(404, {});
    if (mode === 'disconnect') {
      counts.disconnect++;
      return res.destroy();
    }
    if (mode === 'timeout') {
      counts.timeout++;
      // Accept the connection without forwarding or replying. The real client
      // timeout must release it; no refresh/logout can be consumed upstream.
      req.resume();
      return;
    }
    counts.forwarded++;
    const upstream = request(
      {
        hostname: api.hostname,
        port: api.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: api.host },
      },
      (response) => {
        observe({
          method: req.method,
          path: req.url,
          authorization: req.headers.authorization,
          status: response.statusCode,
        });
        res.writeHead(response.statusCode, response.headers);
        response.on('error', () => res.destroy());
        response.pipe(res);
      }
    );
    upstream.on('error', () => {
      if (!res.headersSent) reply(502, { error: { code: 'SERVER_ERROR' } });
      else res.destroy();
    });
    upstream.setTimeout(30_000, () => upstream.destroy());
    req.on('error', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    counts,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
