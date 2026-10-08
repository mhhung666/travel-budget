import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyLedgerTraffic } from './ledger-trace.mjs';
const id = '12345678-1234-4234-8234-123456789012';
const trip = 'a'.repeat(24),
  userId = 'b'.repeat(24);
const write = (extra = {}) => ({
  method: 'POST',
  path: `/api/v2/trips/${trip}/expenses`,
  userId,
  mutationRequest: { id, fingerprint: 'c'.repeat(64) },
  ...extra,
});
const lookup = (extra = {}) => ({
  method: 'GET',
  path: `/api/v2/trips/${trip}/expense-requests/${id}`,
  userId,
  ...extra,
});
test('B4 wire evidence permits byte-identical retries and original-version lookups', () => {
  const summary = verifyLedgerTraffic([write(), write(), lookup()]);
  assert.equal(summary.operations[0].writes, 2);
  assert.equal(summary.operations[0].lookups, 1);
  assert.equal(summary.operations[0].frozen.version, 2);
  assert.equal(summary.unknownLookups, 0);
});
test('wire checks reject a different body or recovery version under the same UUID', () => {
  assert.throws(
    () =>
      verifyLedgerTraffic([
        write(),
        write({ mutationRequest: { id, fingerprint: 'd'.repeat(64) } }),
      ]),
    /UUID changed/
  );
  assert.throws(
    () => verifyLedgerTraffic([write(), write({ path: `/api/v1/trips/${trip}/expenses` })]),
    /UUID changed/
  );
  assert.throws(
    () =>
      verifyLedgerTraffic([
        write(),
        lookup({ path: `/api/v1/trips/${trip}/expense-requests/${id}` }),
      ]),
    /API version/
  );
  assert.throws(
    () => verifyLedgerTraffic([write(), lookup({ userId: 'd'.repeat(24) })]),
    /Another account/
  );
});
test('E actor UUID stays frozen across trip/operation and is distinct from C identity', () => {
  const paid = write({ path: `/api/v2/trips/${trip}/payments` });
  assert.throws(
    () =>
      verifyLedgerTraffic([
        paid,
        write({ method: 'DELETE', path: `/api/v2/trips/${trip}/payments/${trip}` }),
      ]),
    /UUID changed/
  );
  const summary = verifyLedgerTraffic([
    write(),
    paid,
    { ...lookup(), path: `/api/v2/mutation-requests/${id}` },
  ]);
  assert.equal(summary.operations.length, 2);
  assert.equal(summary.operations[1].lookups, 1);
});
test('missing earlier wire baseline is reported, and malformed known evidence fails closed', () => {
  assert.equal(verifyLedgerTraffic([lookup()]).unknownLookups, 1);
  assert.throws(() => verifyLedgerTraffic([write({ userId: undefined })]), /actor/);
  assert.equal(verifyLedgerTraffic([]).observedWrites, 0);
});
