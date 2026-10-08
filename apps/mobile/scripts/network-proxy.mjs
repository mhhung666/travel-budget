import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, request } from 'node:http';
import { isRefreshPath } from './auth-trace.mjs';

// Original drop-response commands still target C only; B4 drop-write-response targets confirmed writes.
const isExpenseCreate = (req) =>
  req.method === 'POST' &&
  /^\/api\/v[12]\/trips\/[a-f0-9]{24}\/expenses$/.test(new URL(req.url, 'http://proxy').pathname);

/** Disposable loopback transport faults. Never mounted in the application/backend. */
export async function startNetworkProxy(apiUrl, port, observe = () => {}, nativeCommand) {
  const api = new URL(apiUrl);
  assert(
    api.protocol === 'http:' && api.hostname === '127.0.0.1' && api.pathname === '/api/v1',
    'Network acceptance requires the disposable loopback API'
  );
  const writePath =
    /^\/api\/v[12]\/(?:trips(?:\/join)?|trips\/[a-f0-9]{24}\/(?:expenses(?:\/[a-f0-9]{24})?|payments(?:\/[a-f0-9]{24})?|currency-settings|settings|members(?:\/[a-f0-9]{24})?|access|archive))$/;
  const isWrite = (req) =>
    ['POST', 'PATCH', 'DELETE'].includes(req.method) &&
    writePath.test(new URL(req.url, 'http://proxy').pathname);
  const token = randomBytes(32).toString('hex');
  let mode = 'online';
  // One-shot: the next expense creation is forwarded and committed upstream, then its response is
  // thrown away. `offline` also takes the connection down afterwards, as a dying network would.
  let armed = null;
  const injections = new Map();
  // Faults armed only once another injected fault has fired: v2 asks for the receipt before its
  // POST, so a lookup fault meant for the follow-up must not hit that pre-send check.
  const followUps = new Map();
  const counts = { forwarded: 0, disconnect: 0, timeout: 0, dropped: 0 };
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.url.startsWith('/__network/')) {
      if (req.headers.authorization !== `Bearer ${token}`) return reply(401, {});
      const command = req.url.slice('/__network/'.length);
      if (req.method !== 'POST') return reply(405, {});
      if (nativeCommand && (command.startsWith('sqlite-') || command.startsWith('native-radio-'))) {
        void Promise.resolve()
          .then(() => nativeCommand(command))
          .then((result) => reply(200, result))
          .catch(() => reply(500, { error: 'Native SQLite control failed' }));
        return;
      }
      const atomicFaults = {
        'online-post-401': [['post', 401]],
        'online-post-401-refresh-500': [
          ['post', 401],
          ['refresh', 500],
        ],
        'online-post-429': [['post', 429]],
        'online-post-409-lookup-403': [
          ['post', 409],
          ['lookup', 403, 'post'],
        ],
        'online-lookup-429': [['lookup', 429]],
        'online-drop-response-offline': [],
      };
      if (Object.hasOwn(atomicFaults, command)) {
        mode = 'online';
        armed = command === 'online-drop-response-offline' ? { offline: true } : null;
        injections.clear();
        followUps.clear();
        for (const [target, status, after] of atomicFaults[command])
          if (after) followUps.set(after, [...(followUps.get(after) ?? []), [target, status]]);
          else injections.set(target, status);
        return reply(200, { injected: command });
      }
      if (
        ![
          'online',
          'disconnect',
          'timeout',
          'drop-response',
          'drop-response-offline',
          'drop-write-response',
          'drop-write-response-offline',
        ].includes(command)
      ) {
        const match = command.match(
          /^(post|lookup|refresh|write|mutation-lookup)-(401|403|404|409|429|500)$/
        );
        if (!match) return reply(404, {});
        injections.set(match[1], Number(match[2]));
        return reply(200, { injected: command });
      }
      if (command.startsWith('drop-response') || command.startsWith('drop-write-response'))
        armed = {
          offline: command.endsWith('-offline'),
          allWrites: command.startsWith('drop-write-response'),
        };
      else {
        mode = command;
        // `online` also stands down a drop that was armed but never used.
        if (command === 'online') {
          armed = null;
          injections.clear();
          followUps.clear();
        }
      }
      return reply(200, { mode, armed: armed !== null });
    }
    if (!/^\/api\/v[12]\//.test(req.url)) return reply(404, {});
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
    // Only confirmed fixture writes: keep the UUID and a one-way byte fingerprint, never body data.
    let expenseRequest;
    if (isWrite(req)) {
      const chunks = [];
      let bytes = 0;
      req.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes <= 65536) chunks.push(chunk);
      });
      req.on('end', () => {
        if (bytes > 65536) return;
        const body = Buffer.concat(chunks);
        try {
          const id = JSON.parse(body.toString()).client_request_id;
          if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))
            expenseRequest = { id, fingerprint: createHash('sha256').update(body).digest('hex') };
        } catch {
          // Invalid bodies cannot establish a frozen request acceptance baseline.
        }
      });
    }
    const pathname = new URL(req.url, 'http://proxy').pathname;
    const target = isExpenseCreate(req)
      ? 'post'
      : req.method === 'GET' &&
          /^\/api\/v[12]\/trips\/[a-f0-9]{24}\/expense-requests\/[0-9a-f-]{36}$/.test(pathname)
        ? 'lookup'
        : req.method === 'POST' && isRefreshPath(pathname)
          ? 'refresh'
          : null;
    const mutationLookup =
      req.method === 'GET' && /^\/api\/v[12]\/mutation-requests\/[0-9a-f-]{36}$/i.test(pathname);
    const faultTarget = injections.has(target)
      ? target
      : isWrite(req)
        ? 'write'
        : mutationLookup
          ? 'mutation-lookup'
          : null;
    const injected = injections.get(faultTarget);
    if (injected) {
      injections.delete(faultTarget);
      for (const [target, status] of followUps.get(faultTarget) ?? [])
        injections.set(target, status);
      followUps.delete(faultTarget);
      req.resume();
      req.on('end', () => {
        observe({
          method: req.method,
          path: req.url,
          authorization: req.headers.authorization,
          status: injected,
          injected: true,
          ...(expenseRequest
            ? {
                mutationRequest: expenseRequest,
                ...(isExpenseCreate(req) ? { expenseRequest } : {}),
              }
            : {}),
        });
        const codes = {
          401: 'UNAUTHORIZED',
          403: 'FORBIDDEN',
          404: 'NOT_FOUND',
          409: 'IDEMPOTENCY_CONFLICT',
          429: 'RATE_LIMITED',
          500: 'SERVER_ERROR',
        };
        res.writeHead(injected, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...(injected === 429 ? { 'Retry-After': '180' } : {}),
        });
        res.end(JSON.stringify({ error: { code: codes[injected] } }));
      });
      return;
    }
    counts.forwarded++;
    const drop = armed && (armed.allWrites ? isWrite(req) : isExpenseCreate(req)) ? armed : null;
    if (drop) armed = null;
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
          ...(expenseRequest
            ? {
                mutationRequest: expenseRequest,
                ...(isExpenseCreate(req) ? { expenseRequest } : {}),
              }
            : {}),
          ...(drop ? { dropped: true } : {}),
        });
        if (drop) {
          // The backend has answered, so its work is done. The client never hears about it.
          response.on('error', () => res.destroy());
          response.on('end', () => {
            counts.dropped++;
            if (drop.offline) mode = 'disconnect';
            res.destroy();
          });
          response.resume();
          return;
        }
        res.writeHead(response.statusCode, response.headers);
        response.on('error', () => res.destroy());
        response.pipe(res);
      }
    );
    upstream.on('error', () => {
      // Nothing was committed that this client could have missed: keep the drop for the next write.
      if (drop && !armed) armed = drop;
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
