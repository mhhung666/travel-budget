import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { once } from 'node:events';
import { v2Schemas, tripsSchema, mutationRequestSchema } from '@travel-budget/contracts';

/** Runs only inside verify-mobile-api's owned, disposable database and authenticated HTTP server. */
export async function verifyLedgerApi({
  db,
  request,
  login,
  ObjectId,
  date,
  origin,
  creationEnabled = false,
}) {
  const session = await login('mobile-ledger');
  const actor = new ObjectId(session.user.id);
  const peer = (await db.collection('users').findOne({ username: 'mobile-ledger-b' }))._id;
  const third = (await db.collection('users').findOne({ username: 'mobile-empty' }))._id;
  const outsider = await login('mobile-empty');
  const members = [actor, peer, third];
  const unit = { baseCurrency: 'USD', moneyScale: 2 };
  const call = (path, options = {}) =>
    request(path, { token: session.accessToken, version: 'v2', ...options });
  const cap = (await call('/capabilities', { schema: v2Schemas.V2Capabilities })).data;
  assert.equal(cap.nonTwdCreationEnabled, creationEnabled);
  if (creationEnabled) {
    for (const base of ['USD', 'JPY']) {
      const body = {
        client_request_id: randomUUID(),
        name: `B4 local create ${base}`,
        base_currency: base,
      };
      const result = (await call('/trips', { body, schema: v2Schemas.V2TripMutationResult })).data;
      const repeated = (await call('/trips', { body, schema: v2Schemas.V2TripMutationResult }))
        .data;
      assert.deepEqual(repeated, result);
      assert.deepEqual(result.ledger, { baseCurrency: base, moneyScale: 2 });
      assert.equal(
        await db
          .collection('trips')
          .countDocuments({ _id: new ObjectId(result.tripId), baseCurrency: base }),
        1
      );
    }
  } else {
    const blocked = {
      client_request_id: randomUUID(),
      name: 'Must not create',
      base_currency: 'USD',
    };
    assert.equal(
      (await call('/trips', { body: blocked, status: 409 })).error.code,
      'FEATURE_NOT_AVAILABLE'
    );
    const rejected = (
      await call(`/mutation-requests/${blocked.client_request_id}`, {
        schema: v2Schemas.V2MutationRequest,
      })
    ).data;
    assert.equal(rejected.code, 'FEATURE_NOT_AVAILABLE');
    assert.deepEqual(rejected.ledger, unit);
    assert.equal(await db.collection('trips').countDocuments({ name: blocked.name }), 0);
    assert.equal(
      (
        await request(`/mutation-requests/${blocked.client_request_id}`, {
          token: session.accessToken,
          status: 409,
        })
      ).error.code,
      'CLIENT_UPGRADE_REQUIRED'
    );
  }

  const trip = new ObjectId();
  await db.collection('trips').insertOne({
    _id: trip,
    baseCurrency: 'USD',
    name: 'B1 USD',
    description: '',
    hashCode: 'b1httpxx',
    createdAt: new Date(),
    members: members.map((user, i) => ({
      user,
      role: i === 0 ? 'admin' : 'member',
      joinedAt: new Date('2026-01-01'),
      budget: null,
    })),
  });
  const path = `/trips/${trip}`;
  const previewBody = {
    base_currency: 'USD',
    amount: 3000,
    currency: 'JPY',
    exchange_rate: 0.0067,
    member_ids: members.map(String),
  };
  const preview = (
    await call(`${path}/expenses/preview`, {
      body: previewBody,
      schema: v2Schemas.V2ExpensePreview,
    })
  ).data;
  assert.deepEqual(preview.ledger, unit);
  assert.equal(preview.amount, 20.1);
  assert.deepEqual(
    preview.splits.map((s) => s.shareAmount),
    [6.7, 6.7, 6.7]
  );
  await call(`${path}/expenses/preview`, {
    body: { ...previewBody, base_currency: 'TWD' },
    status: 409,
  });
  await call(`${path}/expenses/preview`, {
    body: { ...previewBody, currency: 'USD', exchange_rate: 2 },
    status: 400,
  });
  for (const endpoint of [
    '/landing',
    '/expense-options',
    '/settlement',
    '/members',
    '/settings',
    '/invitation',
    '/currency-settings',
    '/payment-context',
    '/access',
  ]) {
    const response = await request(`${path}${endpoint}`, {
      token: session.accessToken,
      status: 409,
    });
    assert.equal(response.error.code, 'CLIENT_UPGRADE_REQUIRED');
    assert.equal(response.data, undefined);
  }
  const v1List = (
    await request(`/trips?date=${date}`, { token: session.accessToken, schema: tripsSchema })
  ).data;
  assert(!v1List.items.some((t) => t.id === String(trip)));
  const v2List = (await call(`/trips?date=${date}`, { schema: v2Schemas.V2Trips })).data;
  assert.deepEqual(v2List.items.find((t) => t.id === String(trip)).ledger, unit);
  await request('/trips/join', {
    token: outsider.accessToken,
    body: { client_request_id: randomUUID(), invite_code: 'b1httpxx' },
    status: 409,
  });
  // Remove the actor before testing a fresh join: a v1 request cannot add a member to USD.
  await db.collection('trips').updateOne({ _id: trip }, { $pull: { members: { user: third } } });
  await request('/trips/join', {
    token: outsider.accessToken,
    body: { client_request_id: randomUUID(), invite_code: 'b1httpxx' },
    status: 409,
  });
  assert.equal(
    await db.collection('trips').countDocuments({ _id: trip, 'members.user': third }),
    0
  );
  const join = { client_request_id: randomUUID(), invite_code: 'b1httpxx' };
  await call('/trips/join', {
    token: outsider.accessToken,
    body: join,
    schema: v2Schemas.V2TripMutationResult,
  });

  const body = {
    base_currency: 'USD',
    client_request_id: randomUUID().toUpperCase(),
    payer_id: String(actor),
    original_amount: 3000,
    currency: 'JPY',
    exchange_rate: 0.0067,
    description: 'B1 dinner',
    category: 'food',
    date,
    splits: preview.splits.map((s) => ({ user_id: s.userId, share_amount: s.shareAmount })),
  };
  const [expense, duplicate] = await Promise.all(
    Array.from({ length: 2 }, () =>
      call(`${path}/expenses`, { body, schema: v2Schemas.V2ExpenseDetail }).then((r) => r.data)
    )
  );
  assert.deepEqual(expense, duplicate);
  assert.deepEqual(expense.ledger, unit);
  assert.equal(await db.collection('expenses').countDocuments({ trip }), 1);
  assert.deepEqual(
    (
      await call(`${path}/expense-requests/${body.client_request_id.toLowerCase()}`, {
        schema: v2Schemas.V2ExpenseRequest,
      })
    ).data.expense,
    expense
  );
  const raw = await db.collection('expenses').findOne({ trip });
  assert.equal(raw.baseCurrency, 'USD');
  assert.equal(raw.originalAmount, 3000);
  assert.equal(raw.amount, 20.1);
  assert.equal(raw.exchangeRate, 0.0067);
  const cReceipt = await db
    .collection('expensecreaterequests')
    .findOne({ _id: `${trip}:${actor}:${body.client_request_id}` });
  assert.equal(cReceipt.contractVersion, 2);
  await call(`${path}/expenses`, { body: { ...body, exchange_rate: 0.0068 }, status: 409 });
  const mismatch = { ...body, client_request_id: randomUUID(), base_currency: 'TWD' };
  assert.equal(
    (await call(`${path}/expenses`, { body: mismatch, status: 409 })).error.code,
    'LEDGER_CURRENCY_MISMATCH'
  );
  assert.equal(
    (
      await call(`${path}/expense-requests/${mismatch.client_request_id}`, {
        schema: v2Schemas.V2ExpenseRequest,
      })
    ).data.status,
    'rejected'
  );

  const editPath = `${path}/expenses/${expense.id}`;
  const edit = (await call(`${editPath}/edit-context`, { schema: v2Schemas.V2ExpenseEditContext }))
    .data;
  const basic = {
    base_currency: 'USD',
    client_request_id: randomUUID(),
    expected_revision: edit.revision,
    mode: 'basic',
    changes: { description: 'B1 updated' },
  };
  await call(editPath, { method: 'PATCH', body: basic, schema: v2Schemas.V2ExpenseMutationResult });
  const receipt = (
    await call(`/mutation-requests/${basic.client_request_id}`, {
      schema: v2Schemas.V2MutationRequest,
    })
  ).data;
  assert.equal(receipt.status, 'committed');
  assert.deepEqual(receipt.ledger, unit);
  assert.deepEqual(
    (
      await call(editPath, {
        method: 'PATCH',
        body: basic,
        schema: v2Schemas.V2ExpenseMutationResult,
      })
    ).data,
    receipt.result
  );
  const context = (await call(`${path}/payment-context`, { schema: v2Schemas.V2PaymentContext }))
    .data;
  assert.deepEqual(
    context.settlement.balances.map((b) => b.balance),
    [13.4, -6.7, -6.7]
  );
  const payment = {
    base_currency: 'USD',
    client_request_id: randomUUID(),
    expected_revision: context.settlementRevision,
    from_id: String(peer),
    to_id: String(actor),
    amount: 3.35,
    note: '',
  };
  const paid = (
    await call(`${path}/payments`, { body: payment, schema: v2Schemas.V2PaymentMutationResult })
  ).data;
  await call(`${path}/payments`, { body: payment, schema: v2Schemas.V2PaymentMutationResult });
  assert.equal(await db.collection('payments').countDocuments({ trip, baseCurrency: 'USD' }), 1);
  const settlement = (await call(`${path}/settlement`, { schema: v2Schemas.V2Settlement })).data;
  assert.deepEqual(
    settlement.balances.map((b) => b.balance),
    [10.05, -3.35, -6.7]
  );
  const paymentPath = `${path}/payments/${paid.paymentId}`;
  const revoke = (
    await call(`${paymentPath}/revoke-context`, { schema: v2Schemas.V2PaymentRevokeContext })
  ).data;
  const remove = {
    base_currency: 'USD',
    client_request_id: randomUUID(),
    expected_revision: revoke.revision,
  };
  await call(paymentPath, {
    method: 'DELETE',
    body: remove,
    schema: v2Schemas.V2PaymentMutationResult,
  });
  await call(paymentPath, {
    method: 'DELETE',
    body: remove,
    schema: v2Schemas.V2PaymentMutationResult,
  });
  assert.equal(await db.collection('payments').countDocuments({ trip }), 0);

  // TWD v2 receipts and revisions cannot be reused through v1 even though the trip is compatible.
  const twdBody = { client_request_id: randomUUID(), name: 'B1 TWD', base_currency: 'TWD' };
  const twd = (await call('/trips', { body: twdBody, schema: v2Schemas.V2TripMutationResult }))
    .data;
  await request(`/mutation-requests/${twdBody.client_request_id}`, {
    token: session.accessToken,
    status: 409,
  });
  await request('/trips', {
    token: session.accessToken,
    body: { client_request_id: twdBody.client_request_id, name: twdBody.name },
    status: 409,
  });
  assert.equal(await db.collection('trips').countDocuments({ _id: new ObjectId(twd.tripId) }), 1);
  const lostBody = {
    ...body,
    base_currency: 'TWD',
    client_request_id: randomUUID(),
    original_amount: 100.01,
    currency: 'TWD',
    exchange_rate: 1,
    splits: [{ user_id: String(actor), share_amount: 100.01 }],
  };
  const socket = connect(Number(new URL(origin).port), '127.0.0.1');
  socket.on('data', () => {}); // Deliberately discard the acknowledgement.
  try {
    await once(socket, 'connect');
    const text = JSON.stringify(lostBody);
    socket.write(
      `POST /api/v2/trips/${twd.tripId}/expenses HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nAuthorization: Bearer ${session.accessToken}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`
    );
    const deadline = Date.now() + 15000;
    while (
      !(await db
        .collection('expensecreaterequests')
        .findOne({ _id: `${twd.tripId}:${actor}:${lostBody.client_request_id}` }))
    ) {
      assert(Date.now() < deadline, 'v2 lost-response expense did not commit');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    socket.destroy();
  }
  const found = (
    await call(`/trips/${twd.tripId}/expense-requests/${lostBody.client_request_id}`, {
      schema: v2Schemas.V2ExpenseRequest,
    })
  ).data;
  assert.deepEqual(
    (
      await call(`/trips/${twd.tripId}/expenses`, {
        body: lostBody,
        schema: v2Schemas.V2ExpenseDetail,
      })
    ).data,
    found.expense
  );
  assert.equal(
    await db.collection('expenses').countDocuments({ trip: new ObjectId(twd.tripId) }),
    1
  );
  assert.equal(
    (
      await request(`/trips/${twd.tripId}/expense-requests/${lostBody.client_request_id}`, {
        token: session.accessToken,
        status: 409,
      })
    ).error.code,
    'CLIENT_UPGRADE_REQUIRED'
  );
  const legacyBody = { client_request_id: randomUUID(), name: 'B1 old TWD' };
  await request('/trips', { token: session.accessToken, body: legacyBody });
  const old = (
    await request(`/mutation-requests/${legacyBody.client_request_id}`, {
      token: session.accessToken,
      schema: mutationRequestSchema,
    })
  ).data;
  assert(!('ledger' in old));
  await call(`/mutation-requests/${legacyBody.client_request_id}`, { status: 409 });

  await db.collection('expenses').updateOne({ _id: raw._id }, { $unset: { baseCurrency: '' } });
  for (const endpoint of ['/landing', '/expenses', '/settlement', '/expense-options'])
    assert.equal(
      (await call(`${path}${endpoint}`, { status: 503 })).error.code,
      'LEDGER_DATA_INVALID'
    );
  await db.collection('expenses').updateOne({ _id: raw._id }, { $set: { baseCurrency: 'USD' } });
  const access = (
    await call(`${path}/access`, {
      token: outsider.accessToken,
      schema: v2Schemas.V2TripAccessContext,
    })
  ).data;
  const leave = {
    client_request_id: randomUUID(),
    action: 'leave',
    expected_revision: access.accessRevision,
  };
  const left = (
    await call(`${path}/access`, {
      token: outsider.accessToken,
      body: leave,
      schema: v2Schemas.V2TripAccessResult,
    })
  ).data;
  assert.deepEqual(
    (
      await call(`${path}/access`, {
        token: outsider.accessToken,
        body: leave,
        schema: v2Schemas.V2TripAccessResult,
      })
    ).data,
    left
  );
  assert.equal(
    (
      await call(`/mutation-requests/${leave.client_request_id}`, {
        token: outsider.accessToken,
        schema: v2Schemas.V2MutationRequest,
      })
    ).data.status,
    'committed'
  );
  console.log(
    'PASS B1 v2 units, gate, v1 blocking/filtering, UUID receipts, expense/payment/revoke and corrupted-data rejection'
  );
}
