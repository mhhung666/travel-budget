import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const stages = new Set([
  'draft-save-before-update',
  'draft-before-pending',
  'draft-after-pending',
  'draft-after-commit',
  'queue-confirm-before-insert',
  'queue-confirm-after-insert',
  'queue-confirm-after-commit',
  'queue-prepare-before-pending',
  'queue-prepare-after-pending',
  'queue-prepare-after-commit',
  'before-cleanup',
  'credential-set',
  'credential-legacy',
  'credential-incompatible',
  'credential-pause',
  'queue-serial-probe',
  'queue-serial-ready',
  'c-retry-enqueued',
  'lookup-before-fetch',
  'options-after-response',
  'preview-after-response',
  'post-before-fetch',
]);

/** Only the isolated native checkout calls these pauses; application builds contain no hook. */
export async function startNativeSqlGate(port) {
  assert(Number.isInteger(port) && port >= 0 && port < 65536);
  const token = randomBytes(32).toString('hex');
  const events = [];
  const held = new Set();
  let armed = null;
  let observed = null;
  let armedFrom = 0;
  const server = createServer((req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, 'http://gate');
    if (url.pathname === '/event' && req.method === 'GET') {
      const stage = url.searchParams.get('stage'),
        id = url.searchParams.get('id');
      if (!stages.has(stage) || !/^[0-9a-f-]{36}$/i.test(id ?? '')) return reply(400, {});
      const event = { stage, id, at: Date.now(), held: stage === armed };
      events.push(event);
      if (event.held) {
        armed = null;
        observed = event;
        if (stage === 'queue-serial-probe') {
          event.injected = true;
          armed = 'lookup-before-fetch';
          return reply(201, {});
        }
        if (['credential-set', 'credential-legacy', 'credential-incompatible'].includes(stage)) {
          event.injected = true;
          return reply(stage === 'credential-set' ? 500 : 201, {});
        }
        held.add(res);
        res.on('close', () => held.delete(res));
        return;
      }
      return reply(200, {});
    }
    if (req.headers.authorization !== `Bearer ${token}`) return reply(401, {});
    if (req.method !== 'POST') return reply(405, {});
    const command = url.pathname.replace(/^\/__gate\//, '');
    if (command.startsWith('arm-')) {
      const stage = command.slice(4);
      if (!stages.has(stage)) return reply(400, {});
      if (armed || held.size) return reply(409, {});
      armed = stage;
      armedFrom = events.length;
      observed = null;
      return reply(200, { armed: stage });
    }
    if (command.startsWith('wait-event-')) {
      const stage = command.slice(11);
      if (!stages.has(stage)) return reply(400, {});
      void (async () => {
        const deadline = Date.now() + 10000;
        while (!res.destroyed && Date.now() < deadline) {
          const event = events.slice(armedFrom).findLast((e) => e.stage === stage);
          if (event) return reply(200, event);
          await delay(100);
        }
        if (!res.destroyed) reply(409, {});
      })();
      return;
    }
    if (command.startsWith('wait-')) {
      const stage = command.slice(5);
      if (!stages.has(stage)) return reply(400, {});
      void (async () => {
        const deadline = Date.now() + 10000;
        while (!res.destroyed && Date.now() < deadline) {
          if (observed?.stage === stage && (held.size === 1 || observed.injected))
            return reply(200, observed);
          await delay(100);
        }
        if (!res.destroyed) reply(409, {});
      })();
      return;
    }
    if (command === 'release') {
      if (observed && held.size) observed.releasedAt = Date.now();
      armed = null;
      for (const response of held) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{}');
      }
      held.clear();
      return reply(200, {});
    }
    return reply(404, {});
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    events,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
