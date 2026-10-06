import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { startNativeSqlGate } from './native-sql-gate.mjs';

test('native SQL pauses exactly one selected stage and resumes only through authenticated host control', async () => {
  const gate = await startNativeSqlGate(0);
  const id = '12345678-1234-4234-8234-123456789012';
  const control = (command, token = gate.token) =>
    fetch(`${gate.url}/__gate/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  const event = (stage) => fetch(`${gate.url}/event?stage=${stage}&id=${id}`);
  try {
    assert.equal((await control('arm-draft-after-pending', 'wrong')).status, 401);
    assert.equal((await control('arm-unknown')).status, 400);
    assert.equal((await event('draft-before-pending')).status, 200);
    assert.equal((await control('arm-draft-after-pending')).status, 200);
    const blocked = event('draft-after-pending');
    assert.equal(await Promise.race([blocked.then(() => true), delay(25, false)]), false);
    const observed = await control('wait-draft-after-pending');
    assert.equal(observed.status, 200);
    assert.deepEqual((({ stage, id, held }) => ({ stage, id, held }))(await observed.json()), {
      stage: 'draft-after-pending',
      id,
      held: true,
    });
    assert.equal((await control('arm-before-cleanup')).status, 409);
    assert.equal((await control('release')).status, 200);
    assert.equal((await blocked).status, 200);
    assert.equal((await event('draft-after-pending')).status, 200, 'the pause is consumed once');
    assert.equal(gate.events.filter((e) => e.held).length, 1);
    assert(!JSON.stringify(gate.events).includes(gate.token));
  } finally {
    await gate.close();
  }
});

test('host can wait before the device reaches its SQL pause', async () => {
  const gate = await startNativeSqlGate(0);
  const control = (command) =>
    fetch(`${gate.url}/__gate/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gate.token}` },
    });
  try {
    assert.equal((await control('arm-draft-after-pending')).status, 200);
    const waiting = control('wait-draft-after-pending');
    assert.equal(await Promise.race([waiting.then(() => true), delay(25, false)]), false);
    const blocked = fetch(
      `${gate.url}/event?stage=draft-after-pending&id=12345678-1234-4234-8234-123456789012`
    );
    const observed = await waiting;
    assert.equal(observed.status, 200);
    assert.equal((await observed.json()).stage, 'draft-after-pending');
    assert.equal((await control('release')).status, 200);
    assert.equal((await blocked).status, 200);
  } finally {
    await gate.close();
  }
});

test('credential faults are one-shot metadata controls with no credential payload', async () => {
  const gate = await startNativeSqlGate(0);
  const control = (command) =>
    fetch(`${gate.url}/__gate/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gate.token}` },
    });
  const event = (stage) =>
    fetch(`${gate.url}/event?stage=${stage}&id=00000000-0000-4000-8000-000000000001`);
  try {
    for (const [stage, status] of [
      ['credential-set', 500],
      ['credential-legacy', 201],
    ]) {
      assert.equal((await control(`arm-${stage}`)).status, 200);
      assert.equal((await event(stage)).status, status);
      assert.equal((await control(`wait-${stage}`)).status, 200);
      assert.equal((await event(stage)).status, 200);
    }
    assert.equal(gate.events.filter((e) => e.injected).length, 2);
    assert(
      gate.events.every((e) =>
        Object.keys(e).every((k) => ['stage', 'id', 'at', 'held', 'injected'].includes(k))
      )
    );
  } finally {
    await gate.close();
  }
});

test('serial probe arms a real lookup pause and observes retry enqueue before release', async () => {
  const gate = await startNativeSqlGate(0);
  const id = '12345678-1234-4234-8234-123456789012';
  const control = (command) =>
    fetch(`${gate.url}/__gate/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gate.token}` },
    });
  const event = (stage) => fetch(`${gate.url}/event?stage=${stage}&id=${id}`);
  try {
    assert.equal((await event('c-retry-enqueued')).status, 200);
    assert.equal((await control('arm-queue-serial-probe')).status, 200);
    assert.equal((await event('queue-serial-probe')).status, 201);
    const lookup = event('lookup-before-fetch');
    assert.equal((await control('wait-lookup-before-fetch')).status, 200);
    const retry = control('wait-event-c-retry-enqueued');
    assert.equal(await Promise.race([retry.then(() => true), delay(25, false)]), false);
    assert.equal((await event('c-retry-enqueued')).status, 200);
    assert.equal((await retry).status, 200);
    assert.equal(await Promise.race([lookup.then(() => true), delay(25, false)]), false);
    assert.equal((await control('release')).status, 200);
    assert.equal((await lookup).status, 200);
    const held = gate.events.find((e) => e.stage === 'lookup-before-fetch');
    assert(held.releasedAt >= held.at);
    assert.equal((await event('queue-serial-probe')).status, 200, 'probe is consumed once');
  } finally {
    await gate.close();
  }
});

test('credential publication pause waits for host release without injecting a storage failure', async () => {
  const gate = await startNativeSqlGate(0);
  const control = (command) =>
    fetch(`${gate.url}/__gate/${command}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${gate.token}` },
    });
  try {
    assert.equal((await control('arm-credential-pause')).status, 200);
    const credential = fetch(
      `${gate.url}/event?stage=credential-pause&id=00000000-0000-4000-8000-000000000001`
    );
    assert.equal((await control('wait-credential-pause')).status, 200);
    assert.equal(await Promise.race([credential.then(() => true), delay(25, false)]), false);
    assert.equal(gate.events[0].injected, undefined);
    assert.equal((await control('release')).status, 200);
    assert.equal((await credential).status, 200);
    assert(!JSON.stringify(gate.events).includes(gate.token));
  } finally {
    await gate.close();
  }
});
