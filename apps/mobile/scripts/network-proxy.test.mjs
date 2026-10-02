import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { startNetworkProxy } from './network-proxy.mjs';

test('local faults block upstream writes and recover without changing HTTP payloads', async () => {
  const received = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url, method: req.method, body, auth: req.headers.authorization });
    res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '7' });
    res.end(JSON.stringify({ error: { code: 'RATE_LIMITED' } }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  let proxy;
  try {
    proxy = await startNetworkProxy(`http://127.0.0.1:${upstream.address().port}/api/v1`, 0);
    const command = (mode, token = proxy.token) =>
      fetch(`${proxy.url}/__network/${mode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    assert.equal((await command('disconnect', 'wrong')).status, 401);
    assert.equal((await command('unknown')).status, 404);
    assert.equal((await fetch(`${proxy.url}/outside-api`)).status, 404);
    const call = (timeout = 5000) =>
      fetch(`${proxy.url}/api/v1/auth/refresh?test=1`, {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-only' },
        body: '{"refreshToken":"test-only"}',
        signal: AbortSignal.timeout(timeout),
      });
    const response = await call();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '7');
    assert.deepEqual(await response.json(), { error: { code: 'RATE_LIMITED' } });
    assert.deepEqual(received, [
      {
        path: '/api/v1/auth/refresh?test=1',
        method: 'POST',
        body: '{"refreshToken":"test-only"}',
        auth: 'Bearer fixture-only',
      },
    ]);
    assert.equal((await command('disconnect')).status, 200);
    await assert.rejects(() => call(), { name: 'TypeError' });
    assert.equal((await command('timeout')).status, 200);
    await assert.rejects(() => call(200), { name: 'TimeoutError' });
    assert.equal(received.length, 1, 'faults must not consume refresh credentials upstream');
    assert.equal((await command('online')).status, 200);
    assert.equal((await call()).status, 429);
    assert.equal(received.length, 2);
    assert.deepEqual(proxy.counts, { forwarded: 2, disconnect: 1, timeout: 1 });
  } finally {
    await proxy?.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('rejects nonfixture upstreams', async () => {
  await assert.rejects(startNetworkProxy('https://example.com/api/v1', 0));
  await assert.rejects(startNetworkProxy('http://127.0.0.1:1234/other', 0));
});
