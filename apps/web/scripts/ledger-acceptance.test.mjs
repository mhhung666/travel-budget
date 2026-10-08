import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyLedgerStage } from './ledger-acceptance.mjs';
const id = (n) => n.toString(16).padStart(24, '0');
const uuid = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const actors = [1, 2, 3].map((n) => ({ id: id(n), username: `b4-${n}` }));
const fixture = { format: 1, actors, trips: { USD: { id: id(9) } } };
function state(stage = 'expense') {
  const receipt = (n, operation, resourceId) => ({
    key: `${id(1)}:${uuid(n)}`,
    operation,
    resourceId,
    status: 'committed',
    contractVersion: 2,
    ledger: { baseCurrency: 'USD', moneyScale: 2 },
    fingerprint: 'b'.repeat(64),
  });
  return {
    format: 1,
    trips: [
      {
        tripId: id(9),
        baseCurrency: 'USD',
        expectedBaseCurrency: 'USD',
        members: actors.map((a, i) => ({
          id: a.id,
          budget: i === 0 ? { baseCurrency: 'USD', total: 10, categories: [] } : null,
        })),
        expenses:
          stage === 'empty'
            ? []
            : [
                {
                  id: id(10),
                  baseCurrency: 'USD',
                  payerId: id(1),
                  amount: 20.1,
                  originalAmount: 3000,
                  currency: 'JPY',
                  exchangeRate: 0.0067,
                  splits: actors.map((a) => ({ userId: a.id, shareAmount: 6.7 })),
                },
              ],
        payments:
          stage === 'partial'
            ? [{ id: id(11), baseCurrency: 'USD', fromId: id(2), toId: id(1), amount: 3.35 }]
            : [],
        receipts:
          stage === 'empty'
            ? []
            : [
                receipt(1, 'expense.create', id(10)),
                ...(stage === 'partial' || stage === 'revoked'
                  ? [receipt(2, 'payment.create', id(11))]
                  : []),
                ...(stage === 'revoked' ? [receipt(3, 'payment.delete', id(11))] : []),
              ],
      },
    ],
  };
}
test('fixed USD stages verify stored cents and exactly one terminal receipt per operation', () => {
  for (const stage of ['empty', 'expense', 'partial', 'revoked']) {
    const report = verifyLedgerStage(fixture, state(stage), 'USD', stage);
    assert.equal(report.currency, 'USD');
    assert.equal(
      report.balanceCents[id(1)],
      stage === 'empty' ? 0 : stage === 'partial' ? 1005 : 1340
    );
  }
});
test('audit fails closed on duplicate writes, missing receipts and different units', () => {
  for (const change of [
    (s) => s.expenses.push(structuredClone(s.expenses[0])),
    (s) => s.receipts.pop(),
    (s) => {
      s.expenses[0].baseCurrency = 'TWD';
    },
    (s) => {
      s.baseCurrency = 'TWD';
    },
    (s) => {
      s.receipts[0].contractVersion = 1;
    },
    (s) => {
      s.receipts[0].ledger.baseCurrency = 'JPY';
    },
  ]) {
    const snapshot = state();
    change(snapshot.trips[0]);
    assert.throws(() => verifyLedgerStage(fixture, snapshot, 'USD', 'expense'));
  }
});
test('audit rejects changed original bundle, unsafe precision and wrong share identities', () => {
  for (const change of [
    (e) => {
      e.exchangeRate = 0.007;
    },
    (e) => {
      e.originalAmount = 20.1;
    },
    (e) => {
      e.splits[0].shareAmount = 6.701;
    },
    (e) => {
      e.splits[0].userId = id(2);
    },
    (e) => {
      e.amount = Infinity;
    },
  ]) {
    const snapshot = state();
    change(snapshot.trips[0].expenses[0]);
    assert.throws(() => verifyLedgerStage(fixture, snapshot, 'USD', 'expense'));
  }
});
test('payment direction and linked create/revoke resource cannot silently diverge', () => {
  const paid = state('partial');
  paid.trips[0].payments[0].fromId = id(1);
  assert.throws(() => verifyLedgerStage(fixture, paid, 'USD', 'partial'));
  const revoked = state('revoked');
  revoked.trips[0].receipts[2].resourceId = id(99);
  assert.throws(() => verifyLedgerStage(fixture, revoked, 'USD', 'revoked'));
});
test('same UUID reused for another operation is rejected even with the right receipt count', () => {
  const snapshot = state('revoked');
  snapshot.trips[0].receipts[2].key = snapshot.trips[0].receipts[1].key.toUpperCase();
  assert.throws(() => verifyLedgerStage(fixture, snapshot, 'USD', 'revoked'), /Duplicate UUID/);
});
test('fixed-case audit requires membership restored and an explicit supported stage', () => {
  const snapshot = state();
  snapshot.trips[0].members.pop();
  assert.throws(() => verifyLedgerStage(fixture, snapshot, 'USD', 'expense'), /membership/);
  assert.throws(() => verifyLedgerStage(fixture, state(), 'USD', 'whatever'));
  assert.throws(() => verifyLedgerStage(fixture, state(), 'EUR', 'expense'));
});

test('TWD legacy parent stays unmodified and JPY keeps fractional ledger cents', () => {
  for (const base of ['TWD', 'JPY']) {
    const snapshot = state();
    const trip = snapshot.trips[0];
    Object.assign(trip, {
      baseCurrency: base,
      expectedBaseCurrency: base,
      storedBaseCurrency: base === 'TWD' ? null : base,
    });
    Object.assign(trip.expenses[0], {
      baseCurrency: base,
      currency: base,
      amount: 100.01,
      originalAmount: 100.01,
      exchangeRate: 1,
      splits: actors.map((a, i) => ({ userId: a.id, shareAmount: [33.34, 33.34, 33.33][i] })),
    });
    trip.receipts[0].ledger.baseCurrency = base;
    const fixtureForBase = { ...fixture, trips: { [base]: { id: id(9) } } };
    assert.equal(
      verifyLedgerStage(fixtureForBase, snapshot, base, 'expense').balanceCents[id(1)],
      6667
    );
    if (base === 'TWD') {
      trip.storedBaseCurrency = 'TWD';
      assert.throws(
        () => verifyLedgerStage(fixtureForBase, snapshot, base, 'expense'),
        /Legacy trip/
      );
    }
  }
});
