import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  entryFlows,
  entryReceiptExpectations,
  expenseTraffic,
  verifyConflictTraffic,
  verifyEntryTraffic,
  verifyEntryDatabase,
} from './entry-trace.mjs';

const writer = 'a'.repeat(24);
const peer = 'b'.repeat(24);
const trip = 'c'.repeat(24);
const uuid = '8d2b0f0e-6a63-4f6f-a0f5-0b7a4d2c9e11';
const write = (extra = {}) => ({
  method: 'POST',
  path: `/api/v1/trips/${trip}/expenses`,
  status: 200,
  userId: writer,
  ...extra,
});
const preview = (status = 200) => ({
  method: 'POST',
  path: `/api/v1/trips/${trip}/expenses/preview`,
  status,
  userId: writer,
});
const refusedOptions = () => ({
  method: 'GET',
  path: `/api/v1/trips/${trip}/expense-options`,
  status: 404,
  userId: writer,
});
const lookup = (status = 200, userId = writer) => ({
  method: 'GET',
  path: `/api/v1/trips/${trip}/expense-requests/${uuid}`,
  status,
  userId,
});
const check = (flow, events, counts = { disconnect: 0 }) =>
  verifyEntryTraffic(flow, events, { writer, peer, counts });

test('sorts proxy events by purpose and ignores other traffic', () => {
  const traffic = expenseTraffic([
    write(),
    preview(),
    lookup(),
    { method: 'GET', path: `/api/v1/trips/${trip}/expenses`, status: 200 },
    { method: 'POST', path: '/api/v1/auth/refresh', status: 200 },
  ]);
  assert.equal(traffic.writes.length, 1);
  assert.equal(traffic.previews.length, 1);
  assert.equal(traffic.lookups.length, 1);
  assert.equal(traffic.refreshes.length, 1);
});

test('every scenario has an expectation', () => {
  assert.deepEqual(entryFlows.sort(), [
    'entry-access',
    'entry-accounts',
    'entry-appearance',
    'entry-create',
    'entry-lost-check',
    'entry-lost-restart',
    'entry-lost-retry',
    'entry-preview-revoked',
    'entry-rejected',
    'entry-retry',
    'entry-session',
  ]);
});

test('a lost answer is one write plus a lookup, never two writes', () => {
  check('entry-lost-check', [write({ dropped: true }), lookup()]);
  assert.throws(() => check('entry-lost-check', [write({ dropped: true }), write(), lookup()]));
  assert.throws(() => check('entry-lost-check', [write(), lookup()]), /dropped/);
  assert.throws(() => check('entry-lost-check', [write({ dropped: true })]));
});

test('a repeat of the identical request is allowed exactly once after a lost answer', () => {
  check('entry-lost-retry', [write({ dropped: true }), write()]);
  assert.throws(() => check('entry-lost-retry', [write({ dropped: true })]));
  assert.throws(() => check('entry-lost-retry', [write({ dropped: true }), write(), write()]));
});

test('writes and lookups made by another account are caught', () => {
  assert.throws(() =>
    check('entry-lost-check', [write({ dropped: true, userId: peer }), lookup()])
  );
  check('entry-accounts', [
    write({ dropped: true }),
    lookup(),
    { method: 'GET', path: '/api/v1/trips', status: 200, userId: peer },
  ]);
  assert.throws(() =>
    check('entry-accounts', [
      write({ dropped: true }),
      lookup(200, peer),
      { method: 'GET', path: '/api/v1/trips', status: 200, userId: peer },
    ])
  );
  assert.throws(() => check('entry-accounts', [write({ dropped: true }), lookup()]), /really used/);
});

test('a request that never left the phone is not counted as written', () => {
  check('entry-retry', [write(), lookup()], { disconnect: 2 });
  assert.throws(() => check('entry-retry', [write(), lookup()], { disconnect: 1 }));
  assert.throws(() =>
    check('entry-retry', [write({ dropped: true }), lookup()], { disconnect: 2 })
  );
});

test('refusals and recovery are checked in order', () => {
  check('entry-access', [write({ dropped: true }), lookup(404), lookup(200)]);
  assert.throws(() => check('entry-access', [write({ dropped: true }), lookup(200), lookup(404)]));
  check('entry-session', [
    write({ dropped: true }),
    lookup(401),
    { method: 'POST', path: '/api/v1/auth/refresh', status: 401 },
    lookup(200),
  ]);
  assert.throws(
    () => check('entry-session', [write({ dropped: true }), lookup(401), lookup(200)]),
    /refreshed/
  );
  check('entry-rejected', [write({ status: 400 }), write()]);
  assert.throws(() => check('entry-rejected', [write(), write()]));
  check('entry-create', [preview(), preview(), write()]);
  assert.throws(() => check('entry-create', [preview(), write()]), /previewed again/);
});

test('a preview refused after access was lost sends nothing to be written', () => {
  check('entry-preview-revoked', [preview(), preview(404), refusedOptions()]);
  // Something was written, or the refusal never happened, or the options were not reread.
  assert.throws(() =>
    check('entry-preview-revoked', [preview(), preview(404), refusedOptions(), write()])
  );
  assert.throws(() => check('entry-preview-revoked', [preview(), preview(), refusedOptions()]));
  assert.throws(() => check('entry-preview-revoked', [preview(), preview(404)]), /options/);
});

test('adding an expense under any text size is one confirmed write after a preview', () => {
  check('entry-appearance', [preview(), write()]);
  assert.throws(() => check('entry-appearance', [write()]), /previewed/);
  assert.throws(() => check('entry-appearance', [preview(), write(), write()]));
  assert.throws(() => check('entry-appearance', [preview(), write({ dropped: true })]));
});

test('database verification catches duplicates, missing receipts and wrong stored amounts', () => {
  const database = { expenses: 1, receipts: 1, amounts: [100] };
  verifyEntryDatabase('entry-create', database);
  assert.throws(() => verifyEntryDatabase('entry-create', { ...database, expenses: 2 }));
  assert.throws(() => verifyEntryDatabase('entry-create', { ...database, receipts: 0 }));
  assert.throws(() => verifyEntryDatabase('entry-create', { ...database, amounts: [99.99] }));
  verifyEntryDatabase('entry-lost-retry', { ...database, amounts: [75.5] });
  verifyEntryDatabase('entry-retry', { ...database, amounts: [50] });
  verifyEntryDatabase('entry-preview-revoked', { expenses: 0, receipts: 0, amounts: [] });
  assert.throws(() => verifyEntryDatabase('entry-preview-revoked', database));
});

test('refusal receipt counts preserve v1 and require both terminal records on v2', () => {
  for (const apiVersion of [1, 2]) {
    const expected = apiVersion === 2 ? 2 : 1;
    const database = { expenses: 1, receipts: expected, amounts: [100] };
    verifyEntryDatabase('entry-rejected', database, apiVersion);
    for (const receipts of [0, 1, 2, 3].filter((count) => count !== expected))
      assert.throws(
        () => verifyEntryDatabase('entry-rejected', { ...database, receipts }, apiVersion),
        /receipt count/
      );
    assert.throws(() =>
      verifyEntryDatabase('entry-rejected', { ...database, expenses: 2 }, apiVersion)
    );
    assert.throws(() =>
      verifyEntryDatabase('entry-rejected', { ...database, amounts: [99] }, apiVersion)
    );
  }
  assert.throws(() => entryReceiptExpectations(3), /version/);
});

test('Maestro refusal checkpoints validate the real host script with each version', () => {
  const flow = readFileSync(new URL('../maestro/entry-rejected.yaml', import.meta.url), 'utf8');
  const script = readFileSync(
    new URL('../maestro/entry-state-command.js', import.meta.url),
    'utf8'
  );
  // Read both real flow checkpoints so a stale hardcoded YAML count cannot pass this test.
  const checkpoints = [...flow.matchAll(/EXPECT_EXPENSES: '([01])'\s+EXPECT_RECEIPTS: (.+)/g)];
  assert.equal(checkpoints.length, 2);
  for (const apiVersion of [1, 2]) {
    const expected = entryReceiptExpectations(apiVersion);
    const env = {
      MAESTRO_ENTRY_REJECTED_RECEIPTS: String(expected.rejected),
      MAESTRO_ENTRY_CORRECTED_RECEIPTS: String(expected.corrected),
    };
    for (const [index, [, expenses, receiptExpression]] of checkpoints.entries()) {
      const match = receiptExpression.match(/^\$\{(\w+)\}$/);
      const receipts = match ? env[match[1]] : receiptExpression.replaceAll("'", '');
      const actual = { expenses: index, receipts: index + (apiVersion === 2 ? 1 : 0) };
      const run = (state) =>
        runInNewContext(script, {
          http: { post: () => ({ status: 200, body: JSON.stringify(state) }) },
          MAESTRO_CONTROL_URL: 'http://fixture.invalid',
          MAESTRO_CONTROL_TOKEN: 'test-only',
          EXPECT_EXPENSES: expenses,
          EXPECT_RECEIPTS: receipts,
        });
      run(actual);
      assert.throws(() => run({ ...actual, receipts: actual.receipts + 1 }), /unexpected state/);
      if (actual.receipts > 0)
        assert.throws(() => run({ ...actual, receipts: actual.receipts - 1 }), /unexpected state/);
      assert.throws(() => run({ ...actual, expenses: index + 1 }), /unexpected state/);
    }
  }
});

// B5c-1: new builds send on v2, and `ExpenseEntry.retry` asks for the receipt before every send.
const v2 = (event) => ({ ...event, path: event.path.replace('/api/v1/', '/api/v2/') });
const other = '1f0c2a4b-7d3e-4c5f-9a6b-2e8d1c0b3a47';
const v2write = (extra = {}, id = uuid) => v2(write({ expenseRequest: { id }, ...extra }));
const v2lookup = (status = 200, id = uuid) => ({
  ...v2(lookup(status)),
  path: `/api/v2/trips/${trip}/expense-requests/${id}`,
});

test('v2: the pre-send receipt check is split off before the scenario is judged', () => {
  const traffic = expenseTraffic([v2(preview()), v2lookup(), v2write()]);
  assert.equal(traffic.version, 2);
  assert.equal(traffic.checks.length, 1);
  assert.equal(traffic.lookups.length, 0);
  check('entry-create', [v2(preview()), v2(preview()), v2lookup(), v2write()]);
  check('entry-appearance', [v2(preview()), v2lookup(), v2write()]);
  // A v2 write without its check, a refused check, or a check about another request.
  assert.throws(() => check('entry-create', [v2(preview()), v2(preview()), v2write()]), /receipt/);
  assert.throws(() =>
    check('entry-create', [v2(preview()), v2(preview()), v2lookup(404), v2write()])
  );
  assert.throws(
    () => check('entry-create', [v2(preview()), v2(preview()), v2lookup(200, other), v2write()]),
    /another request/
  );
  // Still never written twice, and a recovery lookup after a confirmed write is still caught.
  assert.throws(() =>
    check('entry-create', [
      v2(preview()),
      v2(preview()),
      v2lookup(),
      v2write(),
      v2lookup(),
      v2write(),
    ])
  );
  assert.throws(() =>
    check('entry-create', [v2(preview()), v2(preview()), v2lookup(), v2write(), v2lookup()])
  );
  // One operation never mixes versions.
  assert.throws(
    () => check('entry-create', [preview(), preview(), v2lookup(), v2write()]),
    /version/
  );
});

test('the selected native acceptance version must match observed traffic', () => {
  const events = [v2(preview()), v2(preview()), v2lookup(), v2write()];
  verifyEntryTraffic('entry-create', events, { writer, peer, apiVersion: 2 });
  assert.throws(
    () => verifyEntryTraffic('entry-create', events, { writer, peer, apiVersion: 1 }),
    /API version/
  );
  verifyEntryTraffic('entry-create', [preview(), preview(), write()], {
    writer,
    peer,
    apiVersion: 1,
  });
});

test('v2: a retry after a lost answer finds the committed receipt and sends nothing again', () => {
  check('entry-lost-retry', [v2lookup(), v2write({ dropped: true }), v2lookup()]);
  // The v1 shape (an identical repeat) is now a second send on v2.
  assert.throws(() =>
    check('entry-lost-retry', [v2lookup(), v2write({ dropped: true }), v2lookup(), v2write()])
  );
  assert.throws(() => check('entry-lost-retry', [v2lookup(), v2write({ dropped: true })]));
  assert.throws(() => check('entry-lost-retry', [v2lookup(), v2write(), v2lookup()]));
  check('entry-lost-check', [v2lookup(), v2write({ dropped: true }), v2lookup()]);
  check('entry-lost-restart', [v2lookup(), v2write({ dropped: true }), v2lookup(), v2lookup()]);
});

test('v2: recovery, refusal and session scenarios keep their order after the check', () => {
  // The first attempt stopped at its check, which never left the phone.
  check('entry-retry', [v2lookup(), v2lookup(), v2write()], { disconnect: 1 });
  assert.throws(() => check('entry-retry', [v2lookup(), v2lookup(), v2write()], { disconnect: 0 }));
  assert.throws(() => check('entry-retry', [v2lookup(), v2write()], { disconnect: 1 }));
  check('entry-access', [v2lookup(), v2write({ dropped: true }), v2lookup(404), v2lookup(200)]);
  assert.throws(() =>
    check('entry-access', [v2lookup(), v2write({ dropped: true }), v2lookup(200), v2lookup(404)])
  );
  check('entry-session', [
    v2lookup(),
    v2write({ dropped: true }),
    v2lookup(401),
    { method: 'POST', path: '/api/v2/auth/refresh', status: 401 },
    v2lookup(200),
  ]);
  check('entry-accounts', [
    v2lookup(),
    v2write({ dropped: true }),
    v2lookup(),
    { method: 'GET', path: '/api/v2/trips', status: 200, userId: peer },
  ]);
  // A refusal is final only once its receipt says so; the correction is a new request.
  check('entry-rejected', [
    v2lookup(),
    v2write({ status: 400 }),
    v2lookup(),
    v2lookup(200, other),
    v2write({}, other),
  ]);
  assert.throws(() =>
    check('entry-rejected', [
      v2lookup(),
      v2write({ status: 400 }),
      v2lookup(200, other),
      v2write({}, other),
    ])
  );
  assert.throws(
    () =>
      check('entry-rejected', [
        v2lookup(),
        v2write({ status: 400 }),
        v2lookup(),
        v2lookup(),
        v2write(),
      ]),
    /new submission/
  );
  check('entry-preview-revoked', [
    v2(preview()),
    v2(preview(404)),
    { ...refusedOptions(), path: `/api/v2/trips/${trip}/expense-options` },
  ]);
});

test('queue-conflict: the follow-up lookup after the injected 409 is the injected 403', () => {
  const conflict = { status: 409, injected: true };
  const refused = { injected: true };
  verifyConflictTraffic([write(conflict), { ...lookup(403), ...refused }]);
  verifyConflictTraffic([v2lookup(), v2write(conflict), { ...v2lookup(403), ...refused }]);
  // The reviewer's case: the pre-send check got the 403, so the POST never left the phone.
  assert.throws(() => verifyConflictTraffic([{ ...v2lookup(403), ...refused }]));
  // A v2 POST without its check, an uninjected conflict, or a follow-up that was not refused.
  assert.throws(() => verifyConflictTraffic([v2write(conflict), { ...v2lookup(403), ...refused }]));
  assert.throws(() =>
    verifyConflictTraffic([v2lookup(), v2write({ status: 409 }), { ...v2lookup(403), ...refused }])
  );
  assert.throws(
    () => verifyConflictTraffic([v2lookup(), v2write(conflict), v2lookup()]),
    /refused/
  );
  assert.throws(() => verifyConflictTraffic([v2lookup(), v2write(conflict), v2lookup(403)]));
  // v1 never asks before its write.
  assert.throws(() =>
    verifyConflictTraffic([lookup(), write(conflict), { ...lookup(403), ...refused }])
  );
});
