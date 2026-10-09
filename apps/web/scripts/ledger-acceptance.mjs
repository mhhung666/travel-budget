/** B4 helpers for verify-mobile-api's owned, disposable database only. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

// Independent B0 expectations, in integer cents. Do not import the accounting implementation.
export const ledgerCases = {
  TWD: {
    originalAmount: 100.01,
    currency: 'TWD',
    rate: 1,
    amount: 10001,
    shares: [3334, 3334, 3333],
    balances: [6667, -3334, -3333],
    payment: 1,
    paid: [6666, -3333, -3333],
  },
  USD: {
    originalAmount: 3000,
    currency: 'JPY',
    rate: 0.0067,
    amount: 2010,
    shares: [670, 670, 670],
    balances: [1340, -670, -670],
    payment: 335,
    paid: [1005, -335, -670],
  },
  JPY: {
    originalAmount: 100.01,
    currency: 'JPY',
    rate: 1,
    amount: 10001,
    shares: [3334, 3334, 3333],
    balances: [6667, -3334, -3333],
    payment: 1,
    paid: [6666, -3333, -3333],
  },
};
export const ledgerStages = ['empty', 'expense', 'partial', 'revoked'];

export async function createLedgerAcceptance({ db, ObjectId, passwordHash, date }) {
  const actors = ['a', 'b', 'c'].map((letter) => ({
    _id: new ObjectId(),
    username: `b4-${letter}`,
    displayName: `B4 ${letter.toUpperCase()}`,
    email: `b4-${letter}@example.invalid`,
    password: passwordHash,
    isVirtual: false,
  }));
  await db.collection('users').insertMany(actors);
  const trips = Object.keys(ledgerCases).map((base, index) => ({
    _id: new ObjectId(),
    name: `B4 ${base} ledger`,
    hashCode: randomBytes(8).toString('hex'),
    ...(base === 'TWD' ? {} : { baseCurrency: base }),
    createdAt: new Date(),
    members: actors.map((user, i) => ({
      user: user._id,
      role: i === 0 ? 'admin' : 'member',
      joinedAt: new Date(`2026-01-0${i + 1}`),
      budget: base === 'USD' && i === 0 ? { baseCurrency: 'USD', total: 10, categories: [] } : null,
    })),
    ...(index === 1
      ? {
          currencySettings: {
            defaultCurrency: 'JPY',
            currencies: [
              { code: 'JPY', rate: 0.0067 },
              { code: 'TWD', rate: 0.03 },
            ],
          },
        }
      : {}),
  }));
  await db.collection('trips').insertMany(trips);
  const fixture = {
    format: 1,
    date,
    actors: actors.map((a) => ({ id: String(a._id), username: a.username })),
    trips: Object.fromEntries(
      trips.map((t, i) => [
        Object.keys(ledgerCases)[i],
        { id: String(t._id), inviteCode: t.hashCode },
      ])
    ),
  };
  const snapshot = () =>
    db.client.withSession((session) =>
      session.withTransaction(
        async () => {
          const states = [];
          for (const [base, ref] of Object.entries(fixture.trips)) {
            const trip = new ObjectId(ref.id);
            const parent = await db.collection('trips').findOne({ _id: trip }, { session });
            assert(parent, 'B4 trip was deleted; restart the disposable fixture');
            const expenses = await db
              .collection('expenses')
              .find({ trip }, { session })
              .sort({ createdAt: 1, _id: 1 })
              .toArray();
            const payments = await db
              .collection('payments')
              .find({ trip }, { session })
              .sort({ createdAt: 1, _id: 1 })
              .toArray();
            const creations = await db
              .collection('expensecreaterequests')
              .find({ trip }, { session })
              .toArray();
            const mutations = await db
              .collection('mutationrequests')
              .find(
                { $or: [{ 'terminal.tripId': ref.id }, { 'terminal.result.tripId': ref.id }] },
                { session }
              )
              .toArray();
            const receipts = [
              ...creations.map((r) => ({
                key: r._id,
                operation: 'expense.create',
                status: r.data ? 'committed' : 'rejected',
                resourceId: r.data?.id,
                contractVersion: r.contractVersion ?? 1,
                ledger: r.ledger ?? r.data?.ledger,
                fingerprint: r.fingerprint,
              })),
              ...mutations.map((r) => ({
                key: r._id,
                operation: r.terminal.operation,
                status: r.terminal.status,
                resourceId: r.terminal.resourceId,
                contractVersion: r.contractVersion ?? 1,
                ledger: r.terminal.ledger,
                fingerprint: r.fingerprint,
              })),
            ];
            states.push({
              tripId: ref.id,
              baseCurrency: Object.hasOwn(parent, 'baseCurrency') ? parent.baseCurrency : 'TWD',
              storedBaseCurrency: parent.baseCurrency ?? null,
              expectedBaseCurrency: base,
              members: parent.members.map((m) => ({
                id: String(m.user),
                role: m.role,
                budget: m.budget ?? null,
              })),
              expenses: expenses.map((e) => ({
                id: String(e._id),
                baseCurrency: e.baseCurrency ?? 'TWD',
                payerId: String(e.payer),
                amount: e.amount,
                originalAmount: e.originalAmount,
                currency: e.currency,
                exchangeRate: e.exchangeRate,
                splits: e.splits.map((s) => ({
                  userId: String(s.user),
                  shareAmount: s.shareAmount,
                })),
              })),
              payments: payments.map((p) => ({
                id: String(p._id),
                baseCurrency: p.baseCurrency ?? 'TWD',
                fromId: String(p.from),
                toId: String(p.to),
                amount: p.amount,
              })),
              receipts: receipts.sort((a, b) => a.key.localeCompare(b.key)),
            });
          }
          return { format: 1, capturedAt: new Date().toISOString(), trips: states };
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
        }
      )
    );
  const commands = { 'b4-state': snapshot };
  for (const base of Object.keys(fixture.trips)) {
    const parent = trips.find((t) => String(t._id) === fixture.trips[base].id);
    commands[`b4-${base.toLowerCase()}-leave-a`] = async () => {
      await db
        .collection('trips')
        .updateOne({ _id: parent._id }, { $pull: { members: { user: actors[0]._id } } });
      return {};
    };
    commands[`b4-${base.toLowerCase()}-rejoin-a`] = async () => {
      await db
        .collection('trips')
        .updateOne(
          { _id: parent._id, 'members.user': { $ne: actors[0]._id } },
          { $push: { members: parent.members[0] } }
        );
      return {};
    };
  }
  return { fixture, commands, snapshot };
}

function cents(value) {
  assert(Number.isFinite(value), 'Non-finite money');
  const result = Math.round(value * 100);
  assert(Number.isSafeInteger(result) && result / 100 === value, 'Money must preserve exact cents');
  return result;
}

/** Checks one pristine fixed-case run. Extra writes/conflict receipts require a fresh fixture. */
export function verifyLedgerStage(fixture, snapshot, currency, stage) {
  assert.equal(fixture.format, 1);
  assert.equal(snapshot.format, 1);
  assert(ledgerStages.includes(stage), 'Use empty|expense|partial|revoked');
  assert(Object.hasOwn(ledgerCases, currency), 'Use TWD|USD|JPY');
  const ids = fixture.actors.map((a) => a.id);
  assert.equal(new Set(ids).size, 3);
  const state = snapshot.trips.find((t) => t.tripId === fixture.trips[currency].id);
  assert(state, 'Missing trip');
  assert.equal(state.baseCurrency, currency);
  assert.equal(state.expectedBaseCurrency, currency);
  if (currency === 'TWD')
    assert.equal(
      state.storedBaseCurrency,
      null,
      'Legacy trip must retain its missing baseCurrency'
    );
  assert.deepEqual(
    state.members.map((m) => m.id).sort(),
    [...ids].sort(),
    'Restore membership before the fixed-case audit'
  );
  if (currency === 'USD')
    assert.deepEqual(
      state.members.find((m) => m.id === ids[0]).budget,
      { baseCurrency: 'USD', total: 10, categories: [] },
      'Private budget retains its ledger'
    );
  const expected = ledgerCases[currency];
  const expenses = stage === 'empty' ? 0 : 1;
  assert.equal(state.expenses.length, expenses, 'Expense count');
  assert.equal(state.payments.length, stage === 'partial' ? 1 : 0, 'Payment count');
  const balances = [0, 0, 0];
  for (const e of state.expenses) {
    assert.equal(e.baseCurrency, currency);
    assert.equal(cents(e.amount), expected.amount);
    assert.equal(e.payerId, ids[0]);
    assert.equal(e.originalAmount, expected.originalAmount);
    assert.equal(e.currency, expected.currency);
    assert.equal(e.exchangeRate, expected.rate);
    assert.deepEqual(
      e.splits.map((s) => s.userId),
      ids,
      'Stable member/share order'
    );
    assert.deepEqual(
      e.splits.map((s) => cents(s.shareAmount)),
      expected.shares
    );
    balances[0] += cents(e.amount);
    e.splits.forEach((s, i) => {
      balances[i] -= cents(s.shareAmount);
    });
  }
  for (const p of state.payments) {
    assert.equal(p.baseCurrency, currency);
    assert.equal(p.fromId, ids[1]);
    assert.equal(p.toId, ids[0]);
    assert.equal(cents(p.amount), expected.payment);
    balances[1] += cents(p.amount);
    balances[0] -= cents(p.amount);
  }
  assert.deepEqual(
    balances,
    stage === 'empty' ? [0, 0, 0] : stage === 'partial' ? expected.paid : expected.balances
  );
  const operations =
    stage === 'empty'
      ? []
      : stage === 'revoked'
        ? ['expense.create', 'payment.create', 'payment.delete']
        : stage === 'partial'
          ? ['expense.create', 'payment.create']
          : ['expense.create'];
  assert.deepEqual(
    state.receipts.map((r) => r.operation).sort(),
    operations.sort(),
    'Exactly one terminal receipt per fixed-case operation'
  );
  assert.equal(
    new Set(state.receipts.map((r) => r.key.toLowerCase())).size,
    state.receipts.length,
    'Duplicate UUID receipt'
  );
  for (const r of state.receipts) {
    assert.equal(r.status, 'committed');
    assert.equal(r.contractVersion, 2);
    assert.deepEqual(r.ledger, { baseCurrency: currency, moneyScale: 2 });
    assert(/^[a-f0-9]{64}$/.test(r.fingerprint), 'Missing frozen-body fingerprint');
    const parts = r.key.split(':');
    assert.equal(parts.at(-2), ids[0], 'Fixed cases are recorded by A');
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts.at(-1)),
      'Missing operation UUID'
    );
  }
  if (expenses)
    assert.equal(
      state.receipts.find((r) => r.operation === 'expense.create').resourceId,
      state.expenses[0].id
    );
  const created = state.receipts.find((r) => r.operation === 'payment.create');
  if (stage === 'partial') assert.equal(created.resourceId, state.payments[0].id);
  if (stage === 'revoked')
    assert.equal(
      created.resourceId,
      state.receipts.find((r) => r.operation === 'payment.delete').resourceId
    );
  return {
    currency,
    stage,
    tripId: state.tripId,
    counts: { expenses, payments: state.payments.length, receipts: state.receipts.length },
    balanceCents: Object.fromEntries(ids.map((id, i) => [id, balances[i]])),
    receipts: state.receipts,
  };
}

/** Exercise the evidence reader against real routes, then leave device fixtures pristine. */
export async function verifyLedgerAcceptanceHttp({
  b4,
  db,
  request,
  login,
  ObjectId,
  schemas,
  date,
}) {
  const session = await login('b4-a');
  const ids = b4.fixture.actors.map((a) => a.id);
  const call = (path, options = {}) =>
    request(path, { token: session.accessToken, ...options });
  for (const [currency, spec] of Object.entries(ledgerCases)) {
    const ref = b4.fixture.trips[currency];
    const path = `/trips/${ref.id}`;
    const context = (await call(`${path}/expense-options`, { schema: schemas.V2ExpenseOptions }))
      .data;
    assert.equal(context.ledger.baseCurrency, currency);
    const preview = (
      await call(`${path}/expenses/preview`, {
        schema: schemas.V2ExpensePreview,
        body: {
          base_currency: currency,
          amount: spec.originalAmount,
          currency: spec.currency,
          exchange_rate: spec.rate,
          member_ids: ids,
        },
      })
    ).data;
    const uuid = randomUUID;
    const body = {
      base_currency: currency,
      client_request_id: uuid(),
      payer_id: ids[0],
      original_amount: spec.originalAmount,
      currency: spec.currency,
      exchange_rate: spec.rate,
      description: `B4 ${currency} fixed case`,
      category: 'food',
      date,
      splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
    };
    const first = (await call(`${path}/expenses`, { body, schema: schemas.V2ExpenseDetail })).data;
    assert.deepEqual(
      (await call(`${path}/expenses`, { body, schema: schemas.V2ExpenseDetail })).data,
      first
    );
    const found = (
      await call(`${path}/expense-requests/${body.client_request_id}`, {
        schema: schemas.V2ExpenseRequest,
      })
    ).data;
    assert.equal(found.expense.id, first.id);
    verifyLedgerStage(b4.fixture, await b4.snapshot(), currency, 'expense');
    const paymentContext = (
      await call(`${path}/payment-context`, { schema: schemas.V2PaymentContext })
    ).data;
    const paymentBody = {
      base_currency: currency,
      client_request_id: uuid(),
      expected_revision: paymentContext.settlementRevision,
      from_id: ids[1],
      to_id: ids[0],
      amount: spec.payment / 100,
      note: '',
    };
    const payment = (
      await call(`${path}/payments`, { body: paymentBody, schema: schemas.V2PaymentMutationResult })
    ).data;
    assert.deepEqual(
      (
        await call(`${path}/payments`, {
          body: paymentBody,
          schema: schemas.V2PaymentMutationResult,
        })
      ).data,
      payment
    );
    verifyLedgerStage(b4.fixture, await b4.snapshot(), currency, 'partial');
    const settlement = (await call(`${path}/settlement`, { schema: schemas.V2Settlement })).data;
    assert.deepEqual(
      ids.map((id) => cents(settlement.balances.find((b) => b.userId === id).balance)),
      spec.paid
    );
    const revoke = (
      await call(`${path}/payments/${payment.paymentId}/revoke-context`, {
        schema: schemas.V2PaymentRevokeContext,
      })
    ).data;
    const deleteBody = {
      base_currency: currency,
      client_request_id: uuid(),
      expected_revision: revoke.revision,
    };
    await call(`${path}/payments/${payment.paymentId}`, {
      method: 'DELETE',
      body: deleteBody,
      schema: schemas.V2PaymentMutationResult,
    });
    await call(`${path}/payments/${payment.paymentId}`, {
      method: 'DELETE',
      body: deleteBody,
      schema: schemas.V2PaymentMutationResult,
    });
    verifyLedgerStage(b4.fixture, await b4.snapshot(), currency, 'revoked');
    const trip = new ObjectId(ref.id);
    for (const name of [
      'expenses',
      'payments',
      'expensecreaterequests',
      'notifications',
      'activitylogs',
    ])
      await db.collection(name).deleteMany({ trip });
    await db
      .collection('mutationrequests')
      .deleteMany({ $or: [{ 'terminal.tripId': ref.id }, { 'terminal.result.tripId': ref.id }] });
    verifyLedgerStage(b4.fixture, await b4.snapshot(), currency, 'empty');
  }
}
