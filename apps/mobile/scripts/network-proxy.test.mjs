import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { startNetworkProxy } from './network-proxy.mjs';

test('resuming transport arms faults before foreground requests can escape', async () => {
  let writes = 0;
  const upstream = createServer((req, res) => {
    writes++;
    req.resume();
    req.on('end', () => res.end('{}'));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startNetworkProxy(`http://127.0.0.1:${upstream.address().port}/api/v1`, 0);
  const command = (name) =>
    fetch(`${proxy.url}/__network/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${proxy.token}` },
    });
  const create = () =>
    fetch(`${proxy.url}/api/v1/trips/${'a'.repeat(24)}/expenses`, {
      method: 'POST',
      body: '{}',
    });
  try {
    await command('disconnect');
    await command('online-post-401-refresh-500');
    assert.equal((await create()).status, 401);
    assert.equal((await fetch(`${proxy.url}/api/v1/auth/refresh`, { method: 'POST' })).status, 500);
    assert.equal(writes, 0);
    assert.equal((await create()).status, 200);
    await command('online-drop-response-offline');
    await assert.rejects(create, { name: 'TypeError' });
    await assert.rejects(create, { name: 'TypeError' });
    assert.equal(writes, 2, 'transport retries cannot reach the committed write again');
    await command('online-lookup-429');
    const lookup = await fetch(
      `${proxy.url}/api/v1/trips/${'a'.repeat(24)}/expense-requests/12345678-1234-4234-8234-123456789012`
    );
    assert.equal(lookup.status, 429);
    assert.equal(lookup.headers.get('retry-after'), '180');
    assert.equal(writes, 2);
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('fixture write evidence retains UUID and identical byte hashes, excluding credentials and raw input', async () => {
  const events = [];
  const upstream = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200);
      res.end('{}');
    });
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startNetworkProxy(
    `http://127.0.0.1:${upstream.address().port}/api/v1`,
    0,
    (event) => events.push(event)
  );
  try {
    const id = '12345678-1234-4234-8234-123456789012';
    const body = JSON.stringify({ client_request_id: id, description: 'private draft' });
    const write = (path, content) =>
      fetch(`${proxy.url}/api/v1/${path}`, { method: 'POST', body: content });
    await write(`trips/${'a'.repeat(24)}/expenses`, body);
    await write(`trips/${'a'.repeat(24)}/expenses`, body);
    await write(
      'auth/refresh',
      JSON.stringify({ refreshToken: 'private credential', client_request_id: id })
    );
    await write(`trips/${'a'.repeat(24)}/expenses`, '{invalid');
    assert.deepEqual(
      events.slice(0, 2).map((e) => e.expenseRequest),
      [0, 1].map(() => ({
        id,
        fingerprint: createHash('sha256').update(body).digest('hex'),
      }))
    );
    assert.equal(events[2].expenseRequest, undefined);
    assert.equal(events[3].expenseRequest, undefined);
    assert(!JSON.stringify(events).includes('private draft'));
    assert(!JSON.stringify(events).includes('private credential'));
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

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
    assert.deepEqual(proxy.counts, { forwarded: 2, disconnect: 1, timeout: 1, dropped: 0 });
  } finally {
    await proxy?.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('drop-response commits the target write upstream, then discards its answer once', async () => {
  const received = [];
  const upstream = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ method: req.method, path: req.url, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { ok: true } }));
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
    const trip = 'a'.repeat(24);
    const call = (path, method = 'POST') =>
      fetch(`${proxy.url}/api/v1${path}`, {
        method,
        body: method === 'POST' ? '{"client_request_id":"k1"}' : undefined,
        signal: AbortSignal.timeout(5000),
      });
    const create = () => call(`/trips/${trip}/expenses`);

    assert.equal((await command('drop-response', 'wrong')).status, 401);
    assert.deepEqual(await (await command('drop-response')).json(), {
      mode: 'online',
      armed: true,
    });

    // Armed, everything except the creation itself passes untouched.
    for (const [path, method] of [
      [`/trips/${trip}/expenses/preview`, 'POST'],
      [`/trips/${trip}/expenses`, 'GET'],
      [`/trips/${trip}/expense-requests/k1`, 'GET'],
      [`/trips/${trip}/expenses/${'b'.repeat(24)}`, 'GET'],
      ['/auth/refresh', 'POST'],
      [`/trips/not-an-id/expenses`, 'POST'],
    ]) {
      assert.equal((await call(path, method)).status, 200, `${method} ${path}`);
    }
    assert.equal(proxy.counts.dropped, 0);

    // The target write reaches the backend and completes there; its client hears nothing.
    const before = received.length;
    await assert.rejects(() => create(), { name: 'TypeError' });
    assert.equal(received.length, before + 1, 'the backend must have received the write');
    assert.deepEqual(received.at(-1), {
      method: 'POST',
      path: `/api/v1/trips/${trip}/expenses`,
      body: '{"client_request_id":"k1"}',
    });
    assert.equal(proxy.counts.dropped, 1);

    // One-shot: the same write is answered normally afterwards and a lookup works.
    assert.equal((await create()).status, 200);
    assert.equal((await call(`/trips/${trip}/expense-requests/k1`, 'GET')).status, 200);
    assert.equal(proxy.counts.dropped, 1);
    assert.equal(
      received.filter((entry) => entry.method === 'POST' && entry.path.endsWith(`${trip}/expenses`))
        .length,
      2,
      'the dropped write and the one that followed'
    );

    // The `offline` variant also takes the connection down, until it is brought back.
    assert.equal((await command('drop-response-offline')).status, 200);
    await assert.rejects(() => create(), { name: 'TypeError' });
    assert.equal(proxy.counts.dropped, 2);
    await assert.rejects(() => call(`/trips/${trip}/expense-requests/k1`, 'GET'), {
      name: 'TypeError',
    });
    assert.equal((await command('online')).status, 200);
    assert.equal((await call(`/trips/${trip}/expense-requests/k1`, 'GET')).status, 200);

    // Going online stands down a drop that was armed but never used.
    await command('drop-response');
    assert.deepEqual(await (await command('online')).json(), { mode: 'online', armed: false });
    assert.equal((await create()).status, 200);
    assert.equal(proxy.counts.dropped, 2);
  } finally {
    await proxy?.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test('an unreachable backend does not use up an armed drop', async () => {
  const dead = createServer();
  await new Promise((resolve) => dead.listen(0, '127.0.0.1', resolve));
  const port = dead.address().port;
  await new Promise((resolve) => dead.close(resolve));
  const proxy = await startNetworkProxy(`http://127.0.0.1:${port}/api/v1`, 0);
  try {
    await fetch(`${proxy.url}/__network/drop-response`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${proxy.token}` },
    });
    const response = await fetch(`${proxy.url}/api/v1/trips/${'a'.repeat(24)}/expenses`, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(response.status, 502, 'nothing was committed, so the client may be told');
    assert.equal(proxy.counts.dropped, 0);
    const state = await fetch(`${proxy.url}/__network/drop-response`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${proxy.token}` },
    });
    assert.equal((await state.json()).armed, true);
  } finally {
    await proxy.close();
  }
});

test('rejects nonfixture upstreams', async () => {
  await assert.rejects(startNetworkProxy('https://example.com/api/v1', 0));
  await assert.rejects(startNetworkProxy('http://127.0.0.1:1234/other', 0));
});

test('one-shot status faults keep the write UUID/hash and never reach the fixture database', async () => {
  let forwarded = 0;
  const events = [];
  const upstream = createServer((req, res) => {
    forwarded++;
    req.resume();
    req.on('end', () => res.end('{}'));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const proxy = await startNetworkProxy(
    `http://127.0.0.1:${upstream.address().port}/api/v1`,
    0,
    (e) => events.push(e)
  );
  const control = (command) =>
    fetch(`${proxy.url}/__network/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${proxy.token}` },
    });
  const id = '12345678-1234-4234-8234-123456789012';
  const trip = 'a'.repeat(24);
  const body = JSON.stringify({ client_request_id: id, description: 'private native intention' });
  try {
    await control('post-429');
    await control('lookup-403');
    const limited = await fetch(`${proxy.url}/api/v1/trips/${trip}/expenses`, {
      method: 'POST',
      body,
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '180');
    assert.equal(
      (await fetch(`${proxy.url}/api/v1/trips/${trip}/expense-requests/${id}`)).status,
      403
    );
    assert.equal(forwarded, 0);
    assert(events.every((e) => e.injected));
    assert.equal(events[0].expenseRequest.id, id);
    assert.equal(
      events[0].expenseRequest.fingerprint,
      createHash('sha256').update(body).digest('hex')
    );
    assert(!JSON.stringify(events).includes('private native intention'));
    assert.equal(
      (await fetch(`${proxy.url}/api/v1/trips/${trip}/expenses`, { method: 'POST', body })).status,
      200
    );
    assert.equal(forwarded, 1);
    assert.deepEqual(events[2].expenseRequest, events[0].expenseRequest);
    await control('post-409');
    await control('online');
    assert.equal(
      (await fetch(`${proxy.url}/api/v1/trips/${trip}/expenses`, { method: 'POST', body })).status,
      200
    );
  } finally {
    await proxy.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
