/** Additional B2 smoke cases run inside the offline harness's owned DB and production PWA. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
export async function verifyWebLedgerBrowser({
  db,
  page,
  origin,
  userId,
  idbRead,
  eventually,
  pass,
}) {
  const peer = new mongoose.Types.ObjectId();
  const usdTrip = new mongoose.Types.ObjectId(),
    jpyTrip = new mongoose.Types.ObjectId();
  const expenseId = new mongoose.Types.ObjectId();
  const now = new Date();
  const en = JSON.parse(
    await readFile(new URL('../src/i18n/messages/en.json', import.meta.url), 'utf8')
  );
  await db
    .collection('users')
    .insertOne({ _id: peer, username: 'ledger-peer', displayName: 'Ledger Peer', isVirtual: true });
  const members = [
    { user: userId, role: 'admin', joinedAt: now },
    { user: peer, role: 'member', joinedAt: now },
  ];
  await db.collection('trips').insertMany([
    {
      _id: usdTrip,
      name: 'B2 USD ledger',
      hashCode: 'b2usdtest',
      baseCurrency: 'USD',
      members,
      createdAt: now,
    },
    {
      _id: jpyTrip,
      name: 'B2 JPY ledger',
      hashCode: 'b2jpytest',
      baseCurrency: 'JPY',
      members,
      createdAt: now,
    },
  ]);
  await db.collection('expenses').insertMany([
    {
      _id: expenseId,
      trip: usdTrip,
      baseCurrency: 'USD',
      payer: userId,
      createdBy: userId,
      amount: 20.1,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0067,
      description: 'B2 foreign metadata',
      category: 'food',
      date: now,
      createdAt: now,
      splits: [
        { user: userId, shareAmount: 8 },
        { user: peer, shareAmount: 12.1 },
      ],
      attachments: [],
      tags: ['keep'],
      itineraryDays: [],
    },
    {
      trip: jpyTrip,
      baseCurrency: 'JPY',
      payer: userId,
      createdBy: userId,
      amount: 0.01,
      originalAmount: 0.01,
      currency: 'JPY',
      exchangeRate: 1,
      description: 'B2 JPY cents',
      category: 'food',
      date: now,
      createdAt: now,
      splits: [
        { user: userId, shareAmount: 0.01 },
        { user: peer, shareAmount: 0 },
      ],
      attachments: [],
      tags: [],
      itineraryDays: [],
    },
  ]);
  for (const endpoint of ['', '/expenses', '/settlement', '/stats']) {
    const old = await page.request.get(`${origin}/api/public/trips/b2usdtest${endpoint}`);
    assert.equal(old.status(), 409);
    assert.equal((await old.json()).error, 'CLIENT_UPGRADE_REQUIRED');
    const fresh = await page.request.get(
      `${origin}/api/public/v2/trips/b2usdtest${endpoint}?_fresh=b2`
    );
    assert.equal(fresh.status(), 200);
    const body = await fresh.json();
    const data = body.trip ?? body.expenses?.[0] ?? body;
    assert.equal(data.ledger.baseCurrency, 'USD');
    assert.equal(data.ledger.moneyScale, 2);
    assert.equal(data.budget_revision, undefined);
    assert.equal(data.currency_revision, undefined);
  }
  pass(
    'B2 production public routes isolate v1 from USD and return v2 units without private revisions'
  );
  const url = `${origin}/trips/${usdTrip}/expenses`;
  await page.goto(url);
  await page.getByText('B2 foreign metadata', { exact: true }).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('USD'));
  assert.equal(await page.getByText('NT$20.1', { exact: true }).count(), 0);
  await page.getByText('B2 foreign metadata', { exact: true }).click();
  await page.getByRole('button', { name: en.expense.edit, exact: true }).click();
  await page.locator('#expense-description').fill('B2 response lost edit');
  let dropped = false;
  await page.route(url, async (route) => {
    if (
      !dropped &&
      route.request().method() === 'POST' &&
      (route.request().postData() ?? '').includes('B2 response lost edit')
    ) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('button[form="expense-form"]').click();
  await eventually(
    async () =>
      dropped &&
      (await db.collection('expenses').findOne({ _id: expenseId })).description ===
        'B2 response lost edit',
    'B2 metadata edit did not commit upstream'
  );
  await page.unroute(url);
  await page.reload();
  await page.getByRole('button', { name: en.ledger.recover, exact: true }).click();
  const journalKey = `travel-budget-confirmed-v2:${encodeURIComponent(`user:${userId}`)}`;
  await eventually(
    async () =>
      Object.values((await idbRead(journalKey)) ?? {}).some(
        (e) => e.request.operation === 'expense.update' && e.status === 'done'
      ),
    'B2 original UUID was not recovered'
  );
  const saved = await db.collection('expenses').findOne({ _id: expenseId });
  assert.equal(saved.amount, 20.1);
  assert.equal(saved.originalAmount, 3000);
  assert.equal(saved.currency, 'JPY');
  assert.equal(saved.exchangeRate, 0.0067);
  assert.deepEqual(
    saved.splits.map((s) => s.shareAmount),
    [8, 12.1]
  );
  assert.deepEqual(saved.tags, ['keep']);
  assert.equal(
    await db.collection('activitylogs').countDocuments({ trip: usdTrip, type: 'expense_updated' }),
    1
  );
  assert.equal(
    await db
      .collection('mutationrequests')
      .countDocuments({ 'terminal.result.expenseId': String(expenseId) }),
    1
  );
  pass(
    'B2 production metadata edit keeps foreign/non-equal accounting and recovers a lost response once'
  );
  await page.goto(`${origin}/trips/${jpyTrip}/expenses`);
  await page.getByText('B2 JPY cents', { exact: true }).waitFor();
  await page.getByText('¥0.01', { exact: true }).first().waitFor();
  assert.ok((await page.locator('body').innerText()).includes('JPY'));
  assert.equal(await page.getByText('NT$0.01', { exact: true }).count(), 0);
  pass('B2 production PWA displays JPY ledger cents without TWD relabeling');
}
