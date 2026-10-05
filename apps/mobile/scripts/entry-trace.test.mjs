import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  entryFlows,
  expenseTraffic,
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
