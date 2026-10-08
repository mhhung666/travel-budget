/** Disposable local HTTP/MongoDB acceptance environment. Never accepts an external DB URI. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createServer, connect } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { SignJWT, decodeJwt } from 'jose';
import {
  sessionSchema,
  userSchema,
  tripsSchema,
  landingSchema,
  expensesSchema,
  expenseDetailSchema,
  settlementSchema,
  expenseOptionsSchema,
  expensePreviewSchema,
  expenseRequestSchema,
  paymentContextSchema,
  paymentRevokeContextSchema,
  paymentMutationResultSchema,
  expenseEditContextSchema,
  expenseMutationResultSchema,
  tripMembersSchema,
  tripAccessContextSchema, tripAccessResultSchema, memberClaimInvitationSchema,
  memberMutationResultSchema,
  mutationRequestSchema,
} from '@travel-budget/contracts';
import { up as migrateSessions } from '../migrations/20261002100000-mobile-session-expiry.js';
import { up as migrateAccounts } from '../migrations/20261006120000-account-entry-limits.js';
import { up as migrateMutations } from '../migrations/20261006100000-mutation-requests.js';
import { up as migrateRequests } from '../migrations/20260912160000-expense-create-requests.js';
import { createLocalMailbox } from './local-mailbox.mjs';

const args = new Set(process.argv.slice(2));
assert(
  [...args].every((arg) => ['--serve', '--lan', '--mailbox'].includes(arg)),
  'Use --serve [--lan] [--mailbox]'
);
assert(!args.has('--lan') || args.has('--serve'), '--lan requires --serve');
assert(!args.has('--mailbox') || args.has('--serve'), '--mailbox requires --serve');
const exec = promisify(execFile);
const runId = randomUUID().replaceAll('-', '');
const container = `tb-mobile-${runId}`;
const artifacts = await mkdtemp(join(tmpdir(), 'travel-budget-mobile-'));
const dbName = `tb_mobile_${runId}`;
const password = randomBytes(18).toString('base64url');
let mongo;
let app;
let appLog = '';
let terminal;
let control;
let mailbox;
let commandQueue = Promise.resolve();
let stopping = false;
const stop = new AbortController();
const onSignal = () => {
  stopping = true;
  stop.abort();
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually(check, message, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && !stopping) {
    if (await check()) return;
    await delay(250);
  }
  throw new Error(stopping ? 'Stopped' : message);
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
// Current identity metadata is deliberately absent from historical creation receipts.
function receiptFields(detail) {
  const { payerIsVirtual: _payerFlag, ...data } = detail;
  return { ...data, splits: data.splits.map(({ isVirtual: _flag, ...split }) => split) };
}
const pass = (name) => console.log(`PASS ${name}`);
try {
  await exec('docker', ['info', '--format', '{{.ServerVersion}}']);
  // Expense creation commits the expense, its idempotency receipt and the trip fence in one
  // transaction, so even the disposable database must be a (single-node) replica set.
  console.log('Starting disposable local MongoDB replica set');
  await exec('docker', [
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--env',
    'GLIBC_TUNABLES=glibc.pthread.rseq=1',
    '--publish',
    '127.0.0.1::27017',
    'mongo:8.0',
    '--replSet',
    'mobileverify',
    '--bind_ip_all',
  ]);
  const mapping = (await exec('docker', ['port', container, '27017/tcp'])).stdout.trim();
  assert(/^127\.0\.0\.1:\d+$/.test(mapping), 'MongoDB must bind to loopback only');
  const uri = `mongodb://${mapping}/${dbName}?directConnection=true`;
  mongo = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 1000 });
  await eventually(async () => {
    try {
      await mongo.connect();
      return true;
    } catch {
      return false;
    }
  }, 'MongoDB did not start');
  await exec('docker', [
    'exec',
    container,
    'mongosh',
    '--quiet',
    '--eval',
    'rs.initiate({_id:"mobileverify",members:[{_id:0,host:"localhost:27017"}]})',
  ]);
  const db = mongo.db(dbName);
  await eventually(
    async () => (await db.admin().command({ hello: 1 })).isWritablePrimary,
    'MongoDB did not elect a primary'
  );
  await migrateSessions(db);
  await migrateAccounts(db);
  await migrateAccounts(db);
  await migrateRequests(db);
  await migrateMutations(db);
  await migrateMutations(db);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const day = new Date(`${date}T00:00:00.000Z`);
  const users = ['mobile-a', 'mobile-b', 'mobile-empty', 'mobile-rate'].map((username) => ({
    _id: new mongoose.Types.ObjectId(),
    username,
    displayName: `TEST ${username}`,
    email: `${username}@example.invalid`,
    isVirtual: false,
    notifyByEmail: false,
    createdAt: now,
  }));
  const hash = await bcrypt.hash(password, 10);
  await db.collection('users').insertMany(users.map((user) => ({ ...user, password: hash })));
  const member = (user, role = 'member', budget = null, archivedAt = null) => ({
    user: user._id,
    role,
    budget,
    archivedAt,
    joinedAt: now,
  });
  const trip = (name, members, startDate = day, endDate = day) => ({
    _id: new mongoose.Types.ObjectId(),
    name: `TEST ${name}`,
    description: 'Disposable mobile acceptance data',
    hashCode: randomUUID(),
    members,
    startDate,
    endDate,
    createdAt: now,
    currencySettings: null,
    destinationLocation: { name: 'Taipei' },
  });
  const shared = trip('Shared trip', [
    member(users[0], 'admin', { total: 1000, categories: [] }),
    member(users[1], 'member', { total: 9000, categories: [] }),
  ]);
  const future = new Date(day.getTime() + 30 * 86400000);
  const upcoming = Array.from({ length: 20 }, (_, i) =>
    trip(`Upcoming ${String(i + 1).padStart(2, '0')}`, [member(users[0])], future, future)
  );
  const archived = trip('Archived', [member(users[0], 'member', null, now)]);
  const privateTrip = trip('B only', [member(users[1], 'admin')]);
  await db.collection('trips').insertMany([shared, ...upcoming, archived, privateTrip]);
  await db.collection('expenses').insertOne({
    trip: shared._id,
    payer: users[0]._id,
    amount: 100.01,
    originalAmount: 100.01,
    currency: 'TWD',
    exchangeRate: 1,
    description: 'TEST split with cents',
    category: 'food',
    date: day,
    createdAt: now,
    splits: [
      { user: users[0]._id, shareAmount: 50 },
      { user: users[1]._id, shareAmount: 50.01 },
    ],
    attachments: [
      { key: 'private-fixture-key', contentType: 'image/jpeg', size: 1, uploadedBy: users[0]._id },
    ],
  });
  // Read-only ledger fixtures use their own accounts so the trip fixtures above keep their values.
  const person = (username, displayName = `TEST ${username}`, isVirtual = false) => ({
    _id: new mongoose.Types.ObjectId(),
    username,
    displayName,
    email: `${username}@example.invalid`,
    isVirtual,
    notifyByEmail: false,
    createdAt: now,
  });
  const [ledgerOwner, ledgerPeer, ledgerRemoved] = [
    'mobile-ledger',
    'mobile-ledger-b',
    'mobile-removed',
  ].map((username) => person(username));
  const virtualGuest = person('ledger-virtual', 'TEST virtual guest', true);
  await db.collection('users').insertMany(
    [ledgerOwner, ledgerPeer, ledgerRemoved, virtualGuest].map((user) => ({
      ...user,
      password: hash,
    }))
  );
  const ledger = trip('Ledger trip', [
    member(ledgerOwner, 'admin'),
    member(ledgerPeer),
    member(virtualGuest),
    member(ledgerRemoved),
  ]);
  const emptyLedger = trip('Empty ledger', [member(ledgerOwner, 'admin'), member(ledgerPeer)]);
  const settledLedger = trip('Settled ledger', [member(ledgerOwner, 'admin'), member(ledgerPeer)]);
  await db.collection('trips').insertMany([ledger, emptyLedger, settledLedger]);
  const names = new Map(
    [ledgerOwner, ledgerPeer, ledgerRemoved, virtualGuest].map((user) => [
      String(user._id),
      user.displayName,
    ])
  );
  // Expected values are written independently of the server code, in integer cents.
  const toCents = (value) => Math.round(value * 100);
  const evenShares = (cents, count) =>
    Array.from(
      { length: count },
      (_, index) => Math.floor(cents / count) + (index < cents % count ? 1 : 0)
    );
  const ledgerExpenses = [];
  const addLedgerExpense = (doc, expected) => {
    ledgerExpenses.push({
      doc: { trip: ledger._id, createdBy: doc.payer, ...doc },
      expected: { amountCents: toCents(doc.amount), ...expected },
    });
  };
  for (let i = 0; i < 45; i++) {
    const amountCents = (100 + i) * 100;
    const members = [ledgerOwner, ledgerPeer, virtualGuest];
    const shares = evenShares(amountCents, 3);
    addLedgerExpense(
      {
        payer: (i % 2 === 0 ? ledgerOwner : ledgerPeer)._id,
        amount: amountCents / 100,
        originalAmount: amountCents / 100,
        currency: 'TWD',
        exchangeRate: 1,
        description: `TEST bulk ${String(i + 1).padStart(2, '0')}`,
        category: 'food',
        // Groups of nine share a date and groups of three share createdAt: ties across pages.
        date: new Date(Date.UTC(2026, 8, 10 + Math.floor(i / 9))),
        createdAt: new Date(Date.UTC(2026, 8, 1, 8, 0, Math.floor(i / 3))),
        splits: members.map((user, index) => ({
          user: user._id,
          shareAmount: shares[index] / 100,
        })),
        ...(i === 0
          ? {
              attachments: [
                {
                  key: 'private-fixture-key-ledger',
                  contentType: 'image/jpeg',
                  size: 1,
                  uploadedBy: ledgerOwner._id,
                },
              ],
              tags: ['private-tag-ledger'],
            }
          : {}),
      },
      {
        splitCents: members.map((user, index) => [String(user._id), shares[index]]),
        originalAmount: amountCents / 100,
        currency: 'TWD',
        category: 'food',
      }
    );
  }
  addLedgerExpense(
    {
      payer: ledgerPeer._id,
      amount: 99.9,
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0333,
      description: 'TEST foreign currency',
      category: 'shopping',
      date: new Date(Date.UTC(2026, 7, 22)),
      createdAt: new Date(Date.UTC(2026, 8, 1, 7, 0, 3)),
      splits: [
        { user: ledgerOwner._id, shareAmount: 60 },
        { user: ledgerPeer._id, shareAmount: 39.9 },
      ],
    },
    {
      splitCents: [
        [String(ledgerOwner._id), 6000],
        [String(ledgerPeer._id), 3990],
      ],
      originalAmount: 3000,
      currency: 'JPY',
      exchangeRate: 0.0333,
      category: 'shopping',
    }
  );
  addLedgerExpense(
    {
      // A virtual member pays and does not take part in the split.
      payer: virtualGuest._id,
      amount: 200,
      originalAmount: 200,
      currency: 'TWD',
      exchangeRate: 1,
      description: 'TEST virtual payer, uneven split',
      category: 'transportation',
      date: new Date(Date.UTC(2026, 7, 21)),
      createdAt: new Date(Date.UTC(2026, 8, 1, 7, 0, 2)),
      splits: [
        { user: ledgerOwner._id, shareAmount: 120 },
        { user: ledgerPeer._id, shareAmount: 80 },
      ],
    },
    {
      splitCents: [
        [String(ledgerOwner._id), 12000],
        [String(ledgerPeer._id), 8000],
      ],
      originalAmount: 200,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'transportation',
    }
  );
  addLedgerExpense(
    {
      // Historical shape: no original-currency fields and unrounded converted amounts.
      payer: ledgerOwner._id,
      amount: 30.004,
      description: 'TEST legacy expense',
      date: new Date(Date.UTC(2026, 7, 20)),
      createdAt: new Date(Date.UTC(2026, 8, 1, 7, 0, 1)),
      splits: [
        { user: ledgerOwner._id, shareAmount: 15.002 },
        { user: ledgerPeer._id, shareAmount: 15.002 },
      ],
    },
    {
      amountCents: 3000,
      splitCents: [
        [String(ledgerOwner._id), 1500],
        [String(ledgerPeer._id), 1500],
      ],
      originalAmount: 30,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'other',
    }
  );
  const ledgerPayment = {
    trip: ledger._id,
    from: ledgerPeer._id,
    to: ledgerOwner._id,
    amount: 20.5,
    note: 'TEST cash',
    createdBy: ledgerPeer._id,
    createdAt: now,
  };
  await db.collection('expenses').insertMany(ledgerExpenses.map(({ doc }) => doc));
  await db.collection('payments').insertOne(ledgerPayment);
  const settledExpense = {
    trip: settledLedger._id,
    payer: ledgerOwner._id,
    amount: 100,
    originalAmount: 100,
    currency: 'TWD',
    exchangeRate: 1,
    description: 'TEST settled dinner',
    category: 'food',
    date: day,
    createdAt: now,
    splits: [
      { user: ledgerOwner._id, shareAmount: 50 },
      { user: ledgerPeer._id, shareAmount: 50 },
    ],
  };
  await db.collection('expenses').insertOne(settledExpense);
  await db.collection('payments').insertOne({
    trip: settledLedger._id,
    from: ledgerPeer._id,
    to: ledgerOwner._id,
    amount: 50,
    note: '',
    createdBy: ledgerPeer._id,
    createdAt: now,
  });
  // Online-write fixtures. Distinct join times fix the member order that leftover cents follow;
  // the last two share a join time, so stored order must break the tie.
  const [writer, writerPeer, writerRemoved, writerOutsider] = [
    'mobile-writer',
    'mobile-writer-b',
    'mobile-writer-removed',
    'mobile-writer-out',
  ].map((username) => person(username));
  const writerVirtual = person('writer-virtual', 'TEST virtual writer', true);
  await db.collection('users').insertMany(
    [writer, writerPeer, writerRemoved, writerOutsider, writerVirtual].map((user) => ({
      ...user,
      password: hash,
    }))
  );
  const writerMember = (user, role, minute) => ({
    ...member(user, role),
    joinedAt: new Date(Date.UTC(2026, 8, 1, 0, minute)),
  });
  const writerTrip = trip('Writer trip', [
    writerMember(writer, 'admin', 0),
    writerMember(writerPeer, 'member', 1),
    writerMember(writerVirtual, 'member', 2),
    writerMember(writerRemoved, 'member', 2),
  ]);
  const outsiderTrip = trip('Writer outsider trip', [writerMember(writerOutsider, 'admin', 0)]);
  await db.collection('trips').insertMany([writerTrip, outsiderTrip]);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const jwtSecret = randomBytes(48).toString('hex');
  const env = { ...process.env };
  // Mask local .env keys so Next cannot inherit credentials for unrelated remote services.
  for (const file of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    let contents;
    try {
      contents = await readFile(file, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    for (const match of contents.matchAll(/^\s*(?:export\s+)?([\w]+)\s*=/gm)) env[match[1]] = '';
  }
  if (args.has('--mailbox')) mailbox = await createLocalMailbox();
  Object.assign(env, {
    NODE_ENV: 'development',
    MONGODB_URI: uri,
    JWT_SECRET: jwtSecret,
    APP_URL: origin,
    NEXT_TELEMETRY_DISABLED: '1',
    EXPENSE_BACKGROUND_DELIVERY: 'off',
    RESEND_API_KEY: mailbox?.token ?? '',
    RESEND_FROM: mailbox ? 'acceptance@example.test' : '',
    RESEND_BASE_URL: mailbox?.url ?? '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    VAPID_PRIVATE_KEY: '',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: '',
    AI_GATEWAY_API_KEY: '',
    OPENAI_API_KEY: '',
    CRON_SECRET: '',
  });
  app = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--webpack',
      '--hostname',
      args.has('--lan') ? '0.0.0.0' : '127.0.0.1',
      '--port',
      String(port),
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  );
  let appError;
  app.on('error', (error) => {
    appError = error;
  });
  app.stdout.on('data', (data) => {
    appLog = (appLog + data).slice(-100_000);
  });
  app.stderr.on('data', (data) => {
    appLog = (appLog + data).slice(-100_000);
  });
  await eventually(
    async () => {
      if (appError) throw appError;
      if (app.exitCode !== null)
        throw new Error('Next.js exited; stop any other apps/web dev server before retrying');
      try {
        return (
          (await fetch(`${origin}/api/v1/me`, { signal: AbortSignal.timeout(2000) })).status === 401
        );
      } catch {
        return false;
      }
    },
    'Next.js did not start',
    120_000
  );
  async function request(path, { token, body, status = 200, headers = {}, schema, method } = {}) {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(response.status, status, `${path}: unexpected HTTP status`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert(response.headers.get('x-request-id'));
    const payload = await response.json();
    if (status >= 400) {
      assert.equal(typeof payload.error?.code, 'string');
      assert(payload.requestId);
    } else {
      assert(payload.data);
      if (schema) (typeof schema.strict === 'function' ? schema.strict() : schema).parse(payload.data);
    }
    return { data: payload.data, error: payload.error, response };
  }
  const login = async (username = 'mobile-a') =>
    (await request('/auth/login', { body: { username, password }, schema: sessionSchema })).data;
  const refresh = async (session, status = 200) =>
    request('/auth/refresh', {
      body: { refreshToken: session.refreshToken },
      status,
      schema: sessionSchema,
    });
  const me = (session, status = 200) =>
    request('/me', { token: session.accessToken, status, schema: userSchema });
  await request('/auth/login', { body: { username: 'mobile-a', password: 'wrong' }, status: 401 });
  const first = await login('MOBILE-A');
  assert.equal(first.user.id, users[0]._id.toString());
  await me(first);
  const stored = await db
    .collection('mobilesessions')
    .findOne({ _id: new mongoose.Types.ObjectId(decodeJwt(first.accessToken).sid) });
  assert(stored.refreshHash && !JSON.stringify(stored).includes(first.refreshToken));
  pass('real credential login, /me, hashed refresh storage, no-store headers');
  const listing = (
    await request(`/trips?page=1&date=${date}`, { token: first.accessToken, schema: tripsSchema })
  ).data;
  assert.equal(listing.items.length, 20);
  assert.equal(listing.nextPage, 2);
  assert.equal(listing.items[0].id, shared._id.toString());
  const second = (
    await request(`/trips?page=2&date=${date}`, { token: first.accessToken, schema: tripsSchema })
  ).data;
  assert.equal(second.items.length, 2);
  assert.equal(second.nextPage, null);
  assert.equal(second.items.at(-1).id, archived._id.toString());
  assert.equal(new Set([...listing.items, ...second.items].map((item) => item.id)).size, 22);
  const landingPath = `/trips/${shared._id}/landing?date=${date}`;
  const landing = (await request(landingPath, { token: first.accessToken, schema: landingSchema }))
    .data;
  assert.equal(landing.mySpent, 50);
  assert.equal(landing.myBalance, 50.01);
  assert.equal(landing.todayGroupSpent, 100.01);
  assert.equal(landing.budgetTotal, 1000);
  assert.equal(landing.expenseCount, 1);
  assert.equal(landing.memberCount, 2);
  assert.equal(landing.startDate, date);
  for (const item of [...listing.items, ...second.items]) {
    assert(!('hashCode' in item));
    assert(!('members' in item));
  }
  await request(`/trips/${privateTrip._id}/landing?date=${date}`, {
    token: first.accessToken,
    status: 404,
  });
  await request(`/trips/${shared.hashCode}/landing`, { token: first.accessToken, status: 404 });
  await request('/trips?page=0', { token: first.accessToken, status: 400 });
  await request('/trips?date=2026-02-30', { token: first.accessToken, status: 400 });
  pass('pagination, sorting, cents, date-only, private budgets and nonmember access');
  const other = await login('mobile-b');
  const otherLanding = (
    await request(landingPath, { token: other.accessToken, schema: landingSchema })
  ).data;
  assert.equal(otherLanding.mySpent, 50.01);
  assert.equal(otherLanding.myBalance, -50.01);
  assert.equal(otherLanding.budgetTotal, 9000);
  const empty = await login('mobile-empty');
  assert.deepEqual(
    (await request('/trips', { token: empty.accessToken, schema: tripsSchema })).data,
    { items: [], nextPage: null }
  );
  pass('different account views and empty trips');
  // --- Read-only expenses and settlement (delivery A) ---
  const owner = await login('mobile-ledger');
  const raw = (value) => JSON.stringify(value);
  const assertKeys = (value, keys, label) =>
    assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), `${label}: unexpected fields`);
  const hexId = (id) => String(id);
  const byDisplayOrder = (a, b) =>
    b.doc.date - a.doc.date ||
    b.doc.createdAt - a.doc.createdAt ||
    (hexId(b.doc._id) > hexId(a.doc._id) ? 1 : -1);
  const expectedRows = [...ledgerExpenses].sort(byDisplayOrder);
  assert.equal(expectedRows.length, 48);
  // The fixture must straddle a page boundary with an exact date/createdAt tie.
  assert(
    expectedRows[19].doc.date.getTime() === expectedRows[20].doc.date.getTime() &&
      expectedRows[19].doc.createdAt.getTime() === expectedRows[20].doc.createdAt.getTime(),
    'fixture must tie across the first page boundary'
  );
  const listPath = `/trips/${ledger._id}/expenses`;
  const fetchPage = async (token, cursor) =>
    (
      await request(`${listPath}${cursor ? `?cursor=${cursor}` : ''}`, {
        token,
        schema: expensesSchema,
      })
    ).data;
  const pages = [await fetchPage(owner.accessToken)];
  assert.equal(pages[0].items.length, 20);
  assert(pages[0].nextCursor);
  pages.push(await fetchPage(owner.accessToken, pages[0].nextCursor));
  assert.equal(pages[1].items.length, 20);
  // A newer expense added between page loads must not shift or repeat later pages.
  const interloper = {
    ...ledgerExpenses[0].doc,
    _id: new mongoose.Types.ObjectId(),
    description: 'TEST inserted between pages',
    date: new Date(Date.UTC(2026, 8, 30)),
    attachments: [],
    tags: [],
  };
  await db.collection('expenses').insertOne(interloper);
  pages.push(await fetchPage(owner.accessToken, pages[1].nextCursor));
  await db.collection('expenses').deleteOne({ _id: interloper._id });
  assert.equal(pages[2].items.length, 8);
  assert.equal(pages[2].nextCursor, null);
  const listed = pages.flatMap((page) => page.items);
  assert.deepEqual(
    listed.map((item) => item.id),
    expectedRows.map(({ doc }) => hexId(doc._id)),
    'cursor pages must follow date, createdAt and id (descending) without gaps or repeats'
  );
  assert.equal(new Set(listed.map((item) => item.id)).size, 48);
  for (const [index, item] of listed.entries()) {
    const { doc, expected } = expectedRows[index];
    assertKeys(
      item,
      [
        'id',
        'date',
        'description',
        'category',
        'payerId',
        'payerName',
        'payerIsVirtual',
        'amount',
        'originalAmount',
        'currency',
      ],
      'list item'
    );
    assert.deepEqual(item, {
      id: hexId(doc._id),
      date: doc.date.toISOString().slice(0, 10),
      description: doc.description,
      category: expected.category,
      payerId: hexId(doc.payer),
      payerName: names.get(hexId(doc.payer)),
      payerIsVirtual: hexId(doc.payer) === hexId(virtualGuest._id),
      amount: expected.amountCents / 100,
      originalAmount: expected.originalAmount,
      currency: expected.currency,
    });
  }
  const landingOfLedger = (
    await request(`/trips/${ledger._id}/landing?date=${date}`, {
      token: owner.accessToken,
      schema: landingSchema,
    })
  ).data;
  assert.equal(landingOfLedger.expenseCount, listed.length, 'landing and list counts agree');
  for (const { doc, expected } of expectedRows) {
    const detail = (
      await request(`${listPath}/${doc._id}`, {
        token: owner.accessToken,
        schema: expenseDetailSchema,
      })
    ).data;
    assertKeys(
      detail,
      [
        'id',
        'date',
        'description',
        'category',
        'payerId',
        'payerName',
        'payerIsVirtual',
        'amount',
        'originalAmount',
        'currency',
        'exchangeRate',
        'splits',
      ],
      'detail'
    );
    assert.equal(detail.amount, expected.amountCents / 100);
    assert.equal(detail.exchangeRate, expected.exchangeRate ?? 1);
    assert.deepEqual(
      detail.splits.map((split) => [split.userId, toCents(split.shareAmount)]),
      expected.splitCents,
      `${doc.description}: shares`
    );
    for (const split of detail.splits) {
      assertKeys(split, ['userId', 'displayName', 'shareAmount', 'isVirtual'], 'split');
      assert.equal(split.displayName, names.get(split.userId));
    }
    assert.equal(
      detail.splits.reduce((sum, split) => sum + toCents(split.shareAmount), 0),
      expected.amountCents,
      `${doc.description}: shares add up to the amount`
    );
  }
  const virtualRow = listed.find((item) => item.payerId === hexId(virtualGuest._id));
  assert.equal(virtualRow.payerName, 'TEST virtual guest');
  const legacyRow = listed.find((item) => item.description === 'TEST legacy expense');
  assert.deepEqual(
    { amount: legacyRow.amount, currency: legacyRow.currency, category: legacyRow.category },
    { amount: 30, currency: 'TWD', category: 'other' }
  );
  const foreignRow = listed.find((item) => item.currency === 'JPY');
  assert.equal(foreignRow.originalAmount, 3000);
  assert.equal(foreignRow.amount, 99.9);
  const leakPattern =
    /private-fixture-key|private-tag|attachments|tags|hashCode|createdBy|username|email|password|\$2[aby]\$|example\.invalid/;
  assert(!leakPattern.test(raw(pages)), 'list must not expose private fields');
  pass(
    'expense list cursor stability (ties, concurrent insert), detail, legacy/foreign/virtual rows'
  );

  const settlementOf = async (tripId, token = owner.accessToken) =>
    (await request(`/trips/${tripId}/settlement`, { token, schema: settlementSchema })).data;
  const ledgerSettlement = await settlementOf(ledger._id);
  assertKeys(
    ledgerSettlement,
    ['status', 'totalExpenses', 'balances', 'suggestedTransfers', 'payments'],
    'settlement'
  );
  const paid = new Map();
  const owed = new Map();
  for (const { doc, expected } of ledgerExpenses) {
    paid.set(hexId(doc.payer), (paid.get(hexId(doc.payer)) ?? 0) + expected.amountCents);
    for (const [user, cents] of expected.splitCents) owed.set(user, (owed.get(user) ?? 0) + cents);
  }
  const net = new Map(
    [ledgerOwner, ledgerPeer, ledgerRemoved, virtualGuest].map((user) => {
      const id = hexId(user._id);
      let balance = (paid.get(id) ?? 0) - (owed.get(id) ?? 0);
      if (id === hexId(ledgerPeer._id)) balance += toCents(ledgerPayment.amount);
      if (id === hexId(ledgerOwner._id)) balance -= toCents(ledgerPayment.amount);
      return [id, balance];
    })
  );
  assert.equal(ledgerSettlement.status, 'outstanding');
  assert.equal(
    ledgerSettlement.totalExpenses * 100,
    ledgerExpenses.reduce((sum, { expected }) => sum + expected.amountCents, 0)
  );
  assert.deepEqual(
    ledgerSettlement.balances.map((entry) => [entry.userId, toCents(entry.balance)]).sort(),
    [...net].sort()
  );
  for (const entry of ledgerSettlement.balances) {
    assertKeys(entry, ['userId', 'displayName', 'isVirtual', 'totalPaid', 'totalOwed', 'balance'], 'balance');
    assert.equal(toCents(entry.totalPaid), paid.get(entry.userId) ?? 0);
    assert.equal(toCents(entry.totalOwed), owed.get(entry.userId) ?? 0);
    assert.equal(entry.displayName, names.get(entry.userId));
  }
  // Following every suggestion must clear every balance.
  const remaining = new Map(net);
  for (const transfer of ledgerSettlement.suggestedTransfers) {
    assertKeys(transfer, ['fromId', 'fromName', 'fromIsVirtual', 'toId', 'toName', 'toIsVirtual', 'amount'], 'transfer');
    assert.equal(transfer.fromName, names.get(transfer.fromId));
    assert.equal(transfer.toName, names.get(transfer.toId));
    remaining.set(transfer.fromId, remaining.get(transfer.fromId) + toCents(transfer.amount));
    remaining.set(transfer.toId, remaining.get(transfer.toId) - toCents(transfer.amount));
  }
  assert(
    [...remaining.values()].every((cents) => Math.abs(cents) <= 1),
    'transfers clear balances'
  );
  assert(ledgerSettlement.suggestedTransfers.length > 0);
  assert.deepEqual(
    ledgerSettlement.payments.map(({ id: _id, createdAt: _createdAt, ...rest }) => rest),
    [
      {
        fromId: hexId(ledgerPeer._id),
        fromName: 'TEST mobile-ledger-b',
        fromIsVirtual: false,
        toId: hexId(ledgerOwner._id),
        toName: 'TEST mobile-ledger',
        toIsVirtual: false,
        amount: 20.5,
        note: 'TEST cash',
      },
    ]
  );
  assert.equal(
    ledgerSettlement.payments[0].createdAt,
    new Date(ledgerPayment.createdAt).toISOString()
  );
  const settledView = await settlementOf(settledLedger._id);
  assert.equal(settledView.status, 'settled');
  assert.equal(settledView.totalExpenses, 100);
  assert.deepEqual(settledView.suggestedTransfers, []);
  assert.deepEqual(
    settledView.balances.map((entry) => entry.balance),
    [0, 0]
  );
  assert.equal(settledView.payments.length, 1);
  const emptyView = await settlementOf(emptyLedger._id);
  assert.deepEqual(
    {
      status: emptyView.status,
      total: emptyView.totalExpenses,
      transfers: emptyView.suggestedTransfers,
      payments: emptyView.payments,
    },
    { status: 'empty', total: 0, transfers: [], payments: [] }
  );
  assert.equal(emptyView.balances.length, 2);
  assert(
    !leakPattern.test(raw([ledgerSettlement, settledView, emptyView])),
    'settlement must not expose private fields'
  );
  pass(
    'settlement balances, suggestions, registered payments; empty, settled and outstanding states'
  );

  const ledgerExpenseId = hexId(ledgerExpenses[0].doc._id);
  const deny = (path, token, status = 404) => request(path, { token, status });
  // Non-member, cross-trip, share code and malformed ids are all indistinguishable 404s.
  for (const path of [
    `/trips/${ledger._id}/expenses`,
    `/trips/${ledger._id}/expenses/${ledgerExpenseId}`,
    `/trips/${ledger._id}/settlement`,
  ])
    await deny(path, first.accessToken);
  await deny(`/trips/${shared._id}/expenses/${ledgerExpenseId}`, first.accessToken);
  await deny(`/trips/${settledLedger._id}/expenses/${ledgerExpenseId}`, owner.accessToken);
  await deny(`/trips/${ledger._id}/expenses/${hexId(settledExpense._id)}`, owner.accessToken);
  await deny(`/trips/${ledger.hashCode}/expenses`, owner.accessToken);
  await deny(`/trips/${ledger.hashCode}/settlement`, owner.accessToken);
  await deny(`/trips/not-an-id/expenses`, owner.accessToken);
  await deny(`${listPath}/not-an-id`, owner.accessToken);
  await deny(`/trips/${new mongoose.Types.ObjectId()}/settlement`, owner.accessToken);
  for (const cursor of ['bad', '', '1.2.3', `9999999999999999.1.${ledgerExpenseId}`])
    await request(`${listPath}?cursor=${cursor}`, { token: owner.accessToken, status: 400 });
  await request(`${listPath}?cursor=1.2.${ledgerExpenseId}&cursor=1.2.${ledgerExpenseId}`, {
    token: owner.accessToken,
    status: 400,
  });
  for (const path of [
    listPath,
    `${listPath}/${ledgerExpenseId}`,
    `/trips/${ledger._id}/settlement`,
  ])
    await request(path, { status: 401 });
  // Losing membership takes effect immediately, even with a still-valid access token.
  const removedUser = await login('mobile-removed');
  await request(listPath, { token: removedUser.accessToken, schema: expensesSchema });
  await db
    .collection('trips')
    .updateOne({ _id: ledger._id }, { $pull: { members: { user: ledgerRemoved._id } } });
  for (const path of [
    listPath,
    `${listPath}/${ledgerExpenseId}`,
    `/trips/${ledger._id}/settlement`,
  ])
    await deny(path, removedUser.accessToken);
  await db
    .collection('trips')
    .updateOne({ _id: ledger._id }, { $push: { members: member(ledgerRemoved) } });
  pass(
    'non-member, cross-trip, share-code, malformed id, bad cursor, unauthenticated and revoked access'
  );
  // --- Online expense entry (delivery B) ---
  const writerSession = await login('mobile-writer');
  const peerSession = await login('mobile-writer-b');
  const removedWriter = await login('mobile-writer-removed');
  const outsiderSession = await login('mobile-writer-out');
  const tripPath = `/trips/${writerTrip._id}`;
  const memberOrder = [writer, writerPeer, writerVirtual, writerRemoved];
  const memberIds = memberOrder.map((user) => hexId(user._id));
  const [writerId, peerId, virtualId, removedId] = memberIds;
  const outsiderId = hexId(writerOutsider._id);
  const writerNames = new Map(memberOrder.map((user) => [hexId(user._id), user.displayName]));
  const evenIds = memberIds.slice(0, 3);
  const counts = async () => {
    const filter = { trip: writerTrip._id };
    return {
      expenses: await db.collection('expenses').countDocuments(filter),
      receipts: await db.collection('expensecreaterequests').countDocuments(filter),
      notifications: await db.collection('notifications').countDocuments(filter),
      activity: await db.collection('activitylogs').countDocuments(filter),
    };
  };
  // Every human except the actor gets one notification; the virtual member gets none.
  const recipients = memberOrder.filter((user) => !user.isVirtual).length - 1;
  const zero = { expenses: 0, receipts: 0, notifications: 0, activity: 0 };
  const rawPost = (path, token, text, headers = { 'Content-Type': 'application/json' }) =>
    fetch(`${origin}/api/v1${path}`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: text,
      signal: AbortSignal.timeout(60_000),
    });
  const expectError = async (response, status, code, label = 'request') => {
    assert.equal(response.status, status, `${label}: unexpected HTTP status`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    if (code) assert.equal(payload.error.code, code, `${label}: unexpected error code`);
    assert(payload.requestId);
    return payload;
  };

  const options = (
    await request(`${tripPath}/expense-options`, {
      token: writerSession.accessToken,
      schema: expenseOptionsSchema,
    })
  ).data;
  assertKeys(options, ['members', 'categories'], 'options');
  assert.deepEqual(
    options.members,
    memberOrder.map((user) => ({ id: hexId(user._id), displayName: user.displayName, isVirtual: user.isVirtual })),
    'members follow join time, then stored order, with virtual members included'
  );
  assert.deepEqual(options.categories, [
    'accommodation',
    'transportation',
    'food',
    'shopping',
    'entertainment',
    'tickets',
    'other',
  ]);
  assert(!leakPattern.test(raw(options)), 'options must not expose private fields');
  await deny(`${tripPath}/expense-options`, outsiderSession.accessToken);
  await deny(`/trips/${writerTrip.hashCode}/expense-options`, writerSession.accessToken);
  await deny('/trips/not-an-id/expense-options', writerSession.accessToken);
  await request(`${tripPath}/expense-options`, { status: 401 });
  pass('expense options: member order, names only, nonmember and share-code access');

  const previewPath = `${tripPath}/expenses/preview`;
  const preview = async (body, token = writerSession.accessToken) =>
    (await request(previewPath, { token, body, schema: expensePreviewSchema })).data;
  const sharesOf = (result) =>
    result.splits.map((split) => [split.userId, toCents(split.shareAmount)]);
  const evenFor = (ids, cents) =>
    ids.map((id, index) => [id, evenShares(cents, ids.length)[index]]);
  const hundred = await preview({ amount: 100, member_ids: evenIds });
  assertKeys(hundred, ['amount', 'splits'], 'preview');
  assert.equal(hundred.amount, 100);
  assert.deepEqual(sharesOf(hundred), evenFor(evenIds, 10000));
  assert.deepEqual(
    hundred.splits.map((split) => split.shareAmount),
    [33.34, 33.33, 33.33]
  );
  for (const split of hundred.splits) {
    assertKeys(split, ['userId', 'displayName', 'shareAmount'], 'preview split');
    assert.equal(split.displayName, writerNames.get(split.userId));
  }
  assert.deepEqual(
    sharesOf(await preview({ amount: 100, member_ids: [...evenIds].reverse() })),
    sharesOf(hundred),
    'the order members were sent in must not move the leftover cent'
  );
  assert.deepEqual(
    sharesOf(await preview({ amount: 0.01, member_ids: evenIds })),
    evenFor(evenIds, 1)
  );
  // Leftover cents follow member order for every subset; the total is always exact.
  for (const [subset, amount] of [
    [[1, 2], 0.03],
    [[0, 3], 10.01],
    [[0, 1, 2, 3], 99.99],
    [[3], 12.34],
    [[0, 1, 2, 3], 0.02],
  ]) {
    const ids = subset.map((index) => memberIds[index]);
    const result = await preview({ amount, member_ids: [...ids].reverse() });
    assert.deepEqual(sharesOf(result), evenFor(ids, toCents(amount)), `${amount} among ${subset}`);
    assert.equal(
      result.splits.reduce((sum, split) => sum + toCents(split.shareAmount), 0),
      toCents(amount)
    );
  }
  const badPreviews = [
    ['stranger', { amount: 100, member_ids: [outsiderId] }],
    ['duplicate', { amount: 100, member_ids: [writerId, writerId] }],
    ['empty list', { amount: 100, member_ids: [] }],
    ['zero', { amount: 0, member_ids: [writerId] }],
    ['negative', { amount: -1, member_ids: [writerId] }],
    ['fractional cent', { amount: 0.001, member_ids: [writerId] }],
    ['three decimals', { amount: 33.345, member_ids: [writerId] }],
    ['unsafe', { amount: 1e21, member_ids: [writerId] }],
    ['above the limit', { amount: 1000000000.01, member_ids: [writerId] }],
    ['drifts by a cent', { amount: 10000000000000, member_ids: [writerId] }],
    ['string', { amount: '100', member_ids: [writerId] }],
    ['null', { amount: null, member_ids: [writerId] }],
    ['unknown field', { amount: 100, member_ids: [writerId], currency: 'TWD' }],
  ];
  for (const [label, body] of badPreviews)
    await expectError(
      await rawPost(previewPath, writerSession.accessToken, JSON.stringify(body)),
      400,
      'VALIDATION_ERROR',
      label
    );
  for (const [label, text] of [
    ['infinite amount', `{"amount":1e999,"member_ids":["${writerId}"]}`],
    ['truncated JSON', '{"amount":'],
  ])
    await expectError(
      await rawPost(previewPath, writerSession.accessToken, text),
      400,
      'VALIDATION_ERROR',
      label
    );
  await expectError(
    await rawPost(previewPath, writerSession.accessToken, '{}', { 'Content-Type': 'text/plain' }),
    415
  );
  await expectError(
    await rawPost(previewPath, writerSession.accessToken, ' '.repeat(9000)),
    413,
    'BODY_TOO_LARGE'
  );
  // Authorization comes first, so a stranger learns nothing from how the body is rejected.
  await expectError(
    await rawPost(previewPath, outsiderSession.accessToken, '{not json'),
    404,
    'NOT_FOUND'
  );
  await expectError(await rawPost(previewPath, undefined, '{}'), 401);
  assert.deepEqual(await counts(), zero, 'a preview must not write anything');
  pass('expense preview: fixed-order equal split, exact totals and strict input');

  const createPath = `${tripPath}/expenses`;
  const sharesFor = (ids, cents) =>
    evenFor(ids, cents).map(([id, share]) => ({ user_id: id, share_amount: share / 100 }));
  const payload = (overrides = {}) => ({
    client_request_id: randomUUID(),
    payer_id: writerId,
    original_amount: 100,
    currency: 'TWD',
    exchange_rate: 1,
    description: 'TEST online dinner',
    category: 'food',
    date,
    splits: sharesFor(evenIds, 10000),
    ...overrides,
  });
  const create = async (body, token = writerSession.accessToken) =>
    (await request(createPath, { token, body, schema: expenseDetailSchema })).data;
  const dinnerBody = payload();
  const dinner = await create(dinnerBody);
  assertKeys(
    dinner,
    [
      'id',
      'date',
      'description',
      'category',
      'payerId',
      'payerName',
      'amount',
      'originalAmount',
      'currency',
      'exchangeRate',
      'splits',
    ],
    'created expense'
  );
  assert.equal(dinner.date, date);
  assert.equal(dinner.description, 'TEST online dinner');
  assert.equal(dinner.category, 'food');
  assert.equal(dinner.payerId, writerId);
  assert.equal(dinner.payerName, writer.displayName);
  assert.deepEqual(
    [dinner.amount, dinner.originalAmount, dinner.currency, dinner.exchangeRate],
    [100, 100, 'TWD', 1]
  );
  assert.deepEqual(
    dinner.splits.map((split) => [split.userId, toCents(split.shareAmount)]),
    evenFor(evenIds, 10000)
  );
  // The stored documents, read independently of the API.
  const dinnerObjectId = new mongoose.Types.ObjectId(dinner.id);
  const storedDinner = await db.collection('expenses').findOne({ _id: dinnerObjectId });
  assert.equal(String(storedDinner.trip), String(writerTrip._id));
  assert.equal(String(storedDinner.payer), writerId);
  assert.equal(String(storedDinner.createdBy), writerId);
  assert.deepEqual(
    [
      storedDinner.amount,
      storedDinner.originalAmount,
      storedDinner.currency,
      storedDinner.exchangeRate,
    ],
    [100, 100, 'TWD', 1]
  );
  assert.equal(storedDinner.date.toISOString(), `${date}T00:00:00.000Z`);
  assert.deepEqual([storedDinner.attachments, storedDinner.tags], [[], []]);
  assert.deepEqual(
    storedDinner.splits.map((split) => [String(split.user), toCents(split.shareAmount)]),
    evenFor(evenIds, 10000)
  );
  const receipt = await db
    .collection('expensecreaterequests')
    .findOne({ _id: `${writerTrip._id}:${writerId}:${dinnerBody.client_request_id}` });
  assert(receipt, 'the receipt is stored under trip, actor and key');
  assert.equal(String(receipt.trip), String(writerTrip._id));
  assert.equal(receipt.data.id, dinner.id);
  // Read back through the read endpoints, as another member.
  const writerList = (
    await request(createPath, { token: peerSession.accessToken, schema: expensesSchema })
  ).data;
  assert.deepEqual(
    writerList.items.map((item) => item.id),
    [dinner.id]
  );
  assert.deepEqual(
    receiptFields((
      await request(`${createPath}/${dinner.id}`, {
        token: peerSession.accessToken,
        schema: expenseDetailSchema,
      })
    ).data),
    dinner
  );
  const dinnerSettlement = await settlementOf(writerTrip._id, writerSession.accessToken);
  assert.equal(dinnerSettlement.totalExpenses, 100);
  assert.deepEqual(
    new Map(dinnerSettlement.balances.map((entry) => [entry.userId, toCents(entry.balance)])),
    new Map([
      [writerId, 6666],
      [peerId, -3333],
      [virtualId, -3333],
      [removedId, 0],
    ])
  );
  assert(!leakPattern.test(raw([dinner, writerList, dinnerSettlement])));
  const afterDinner = await counts();
  assert.deepEqual(afterDinner, {
    expenses: 1,
    receipts: 1,
    notifications: recipients,
    activity: 1,
  });
  pass('expense creation: stored values, receipt, readers, settlement and side effects');

  for (let attempt = 0; attempt < 3; attempt++)
    assert.deepEqual(await create(dinnerBody), dinner, 'a replay returns the accepted result');
  assert.deepEqual(
    await create({ ...dinnerBody, client_request_id: dinnerBody.client_request_id.toUpperCase() }),
    dinner,
    'a key differing only in case is the same key'
  );
  assert.deepEqual(await counts(), afterDinner, 'a replay must not write or notify again');
  for (const [label, changed] of [
    ['description', { description: 'TEST changed' }],
    ['amount', { original_amount: 100.01, splits: sharesFor(evenIds, 10001) }],
    ['category', { category: 'other' }],
    ['date', { date: '2026-01-01' }],
    ['payer', { payer_id: peerId }],
    ['members', { splits: sharesFor(memberIds, 10000) }],
  ]) {
    const conflict = await request(createPath, {
      token: writerSession.accessToken,
      body: { ...dinnerBody, ...changed },
      status: 409,
    });
    assert.equal(conflict.error.code, 'IDEMPOTENCY_CONFLICT', label);
  }
  assert.deepEqual(await counts(), afterDinner, 'a conflict must not write');
  const sameKeyPeer = await create({ ...dinnerBody, payer_id: peerId }, peerSession.accessToken);
  assert.notEqual(sameKeyPeer.id, dinner.id, 'keys are scoped to the member that used them');
  const burstBody = payload({ description: 'TEST burst' });
  const burst = await Promise.all(
    Array.from({ length: 8 }, () =>
      rawPost(createPath, writerSession.accessToken, JSON.stringify(burstBody))
    )
  );
  assert.deepEqual(
    burst.map((response) => response.status),
    Array(8).fill(200)
  );
  const burstResults = await Promise.all(
    burst.map(async (response) => (await response.json()).data)
  );
  for (const result of burstResults) assert.deepEqual(result, burstResults[0]);
  expenseDetailSchema.strict().parse(burstResults[0]);
  assert.deepEqual(await counts(), {
    expenses: 3,
    receipts: 3,
    notifications: recipients * 3,
    activity: 3,
  });
  const many = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      create(payload({ description: `TEST parallel ${index}` }))
    )
  );
  assert.equal(new Set(many.map((expense) => expense.id)).size, 6);
  assert.equal((await counts()).expenses, 9);
  pass(
    'idempotency: replay, key case, 409, member scoping, eight concurrent duplicates, parallel creates'
  );

  const keyPath = (key) => `${tripPath}/expense-requests/${key}`;
  const lookup = async (key, token = writerSession.accessToken) => {
    const { data } = await request(keyPath(key), { token });
    expenseRequestSchema.parse(data);
    if (data.status === 'committed') {
      assertKeys(data, ['status', 'expense'], 'committed lookup');
      expenseDetailSchema.strict().parse(data.expense);
    } else assert.deepEqual(data, { status: 'not_found' });
    return data;
  };
  assert.deepEqual(await lookup(randomUUID()), { status: 'not_found' });
  assert.deepEqual(await lookup(dinnerBody.client_request_id), {
    status: 'committed',
    expense: dinner,
  });
  assert.deepEqual(
    await lookup(dinnerBody.client_request_id, removedWriter.accessToken),
    { status: 'not_found' },
    'a member who never used the key sees nothing under it'
  );
  assert.equal(
    (await lookup(dinnerBody.client_request_id, peerSession.accessToken)).expense.id,
    sameKeyPeer.id,
    'each member sees only their own result for a shared key'
  );
  await request(keyPath(dinnerBody.client_request_id), {
    token: outsiderSession.accessToken,
    status: 404,
  });
  await request(keyPath('not-a-uuid'), { token: writerSession.accessToken, status: 400 });
  await request(keyPath(dinnerBody.client_request_id), { status: 401 });

  // A deleted expense stays accepted: neither a replay nor a lookup brings it back or hides it.
  await db.collection('expenses').deleteOne({ _id: dinnerObjectId });
  assert.deepEqual(await create(dinnerBody), dinner);
  assert.equal(await db.collection('expenses').countDocuments({ _id: dinnerObjectId }), 0);
  assert.deepEqual(await lookup(dinnerBody.client_request_id), {
    status: 'committed',
    expense: dinner,
  });
  pass('result lookup by key and no resurrection of a deleted expense');

  // Losing membership gives nothing back: no replay, no lookup, no new expense, no reading.
  const removedBody = payload({
    payer_id: removedId,
    original_amount: 50,
    description: 'TEST removed member',
    splits: sharesFor([writerId, removedId], 5000),
  });
  const removedExpense = await create(removedBody, removedWriter.accessToken);
  await request(createPath, { token: removedWriter.accessToken, schema: expensesSchema });
  const beforeRemoval = await counts();
  await db
    .collection('trips')
    .updateOne({ _id: writerTrip._id }, { $pull: { members: { user: writerRemoved._id } } });
  await expectError(
    await rawPost(createPath, removedWriter.accessToken, JSON.stringify(removedBody)),
    404,
    'NOT_FOUND',
    'replay after removal'
  );
  await expectError(
    await rawPost(createPath, removedWriter.accessToken, JSON.stringify(payload())),
    404,
    'NOT_FOUND',
    'new expense after removal'
  );
  await expectError(
    await rawPost(
      previewPath,
      removedWriter.accessToken,
      JSON.stringify({ amount: 1, member_ids: [writerId] })
    ),
    404,
    'NOT_FOUND',
    'preview after removal'
  );
  await request(keyPath(removedBody.client_request_id), {
    token: removedWriter.accessToken,
    status: 404,
  });
  await deny(`${tripPath}/expense-options`, removedWriter.accessToken);
  await deny(createPath, removedWriter.accessToken);
  await deny(`${createPath}/${removedExpense.id}`, removedWriter.accessToken);
  assert.deepEqual(await counts(), beforeRemoval, 'a removed member must not change anything');
  await db
    .collection('trips')
    .updateOne(
      { _id: writerTrip._id },
      { $push: { members: writerMember(writerRemoved, 'member', 2) } }
    );
  assert.deepEqual(await create(removedBody, removedWriter.accessToken), removedExpense);
  pass('removed member: replay, lookup, preview, options, reading and new expenses all refused');

  const beforeRejects = await counts();
  const rejects = [
    ['impossible date', { date: '2026-02-31' }],
    ['month 13', { date: '2026-13-01' }],
    ['date with time', { date: `${date}T00:00:00.000Z` }],
    ['stranger as payer', { payer_id: outsiderId }],
    [
      'stranger in split',
      {
        splits: [
          { user_id: writerId, share_amount: 50 },
          { user_id: outsiderId, share_amount: 50 },
        ],
      },
    ],
    [
      'duplicate members',
      {
        splits: [
          { user_id: writerId, share_amount: 50 },
          { user_id: writerId, share_amount: 50 },
        ],
      },
    ],
    ['no members', { splits: [] }],
    ['shares short', { splits: [{ user_id: writerId, share_amount: 99 }] }],
    ['shares over', { splits: [{ user_id: writerId, share_amount: 100.02 }] }],
    ['fractional share', { splits: [{ user_id: writerId, share_amount: 100.001 }] }],
    [
      'negative share',
      {
        splits: [
          { user_id: writerId, share_amount: -1 },
          { user_id: peerId, share_amount: 101 },
        ],
      },
    ],
    ['zero amount', { original_amount: 0 }],
    [
      'three decimals',
      { original_amount: 10.005, splits: [{ user_id: writerId, share_amount: 10.005 }] },
    ],
    [
      'unsafe amount',
      { original_amount: 1e17, splits: [{ user_id: writerId, share_amount: 1e17 }] },
    ],
    [
      'amount above the limit',
      {
        original_amount: 1000000000.01,
        splits: [
          { user_id: writerId, share_amount: 500000000.01 },
          { user_id: peerId, share_amount: 500000000 },
        ],
      },
    ],
    [
      'amount that drifts by a cent',
      {
        original_amount: 10000000000000,
        splits: [
          { user_id: writerId, share_amount: 5000000000000 },
          { user_id: peerId, share_amount: 5000000000000 },
        ],
      },
    ],
    ['foreign currency', { currency: 'JPY' }],
    ['other exchange rate', { exchange_rate: 30 }],
    ['unknown category', { category: 'games' }],
    ['blank description', { description: '   ' }],
    ['long description', { description: 'x'.repeat(201) }],
    ['missing key', { client_request_id: undefined }],
    ['malformed key', { client_request_id: 'abc' }],
    ['attachments', { attachments: [] }],
    ['tags', { tags: ['x'] }],
    ['itinerary days', { itinerary_day_ids: [] }],
    ['unknown field', { note: 'x' }],
  ];
  for (const [label, overrides] of rejects)
    await expectError(
      await rawPost(
        createPath,
        writerSession.accessToken,
        JSON.stringify({ ...payload(), ...overrides })
      ),
      400,
      'VALIDATION_ERROR',
      label
    );
  await expectError(
    await rawPost(createPath, writerSession.accessToken, '{"original_amount":1e999}'),
    400,
    'VALIDATION_ERROR',
    'infinite amount'
  );
  await expectError(
    await rawPost(createPath, writerSession.accessToken, '{}', { 'Content-Type': 'text/plain' }),
    415
  );
  await expectError(
    await rawPost(
      createPath,
      writerSession.accessToken,
      JSON.stringify(payload({ description: 'x'.repeat(9000) }))
    ),
    413,
    'BODY_TOO_LARGE'
  );
  await expectError(await rawPost(createPath, undefined, JSON.stringify(payload())), 401);
  for (const [path, session] of [
    [createPath, outsiderSession],
    [`/trips/${writerTrip.hashCode}/expenses`, writerSession],
    [`/trips/${outsiderTrip._id}/expenses`, writerSession],
    ['/trips/not-an-id/expenses', writerSession],
  ])
    await expectError(
      await rawPost(path, session.accessToken, JSON.stringify(payload())),
      404,
      'NOT_FOUND',
      path
    );
  assert.deepEqual(
    await counts(),
    beforeRejects,
    'rejected requests must not write or leave receipts'
  );
  // Nothing was stored, so a corrected request may reuse the key of a rejected one.
  const reused = payload({ date: '2026-02-31' });
  await expectError(
    await rawPost(createPath, writerSession.accessToken, JSON.stringify(reused)),
    400
  );
  assert.equal((await create({ ...reused, date })).description, 'TEST online dinner');
  pass(
    'expense creation rejects invalid, foreign, unsupported and unauthorized requests without writing'
  );

  // The client sends the request but never reads the response, as if it were lost on the way back:
  // the server still commits, the key finds the result and the retry repeats nothing.
  const lostBody = payload({ description: 'TEST lost response' });
  const lostReceipt = `${writerTrip._id}:${writerId}:${lostBody.client_request_id}`;
  const lostSocket = connect(port, '127.0.0.1');
  lostSocket.on('error', () => {});
  await once(lostSocket, 'connect');
  const lostText = JSON.stringify(lostBody);
  lostSocket.write(
    `POST /api/v1${createPath} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${writerSession.accessToken}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(lostText)}\r\nConnection: close\r\n\r\n${lostText}`
  );
  await eventually(
    async () =>
      (await db.collection('expensecreaterequests').countDocuments({ _id: lostReceipt })) === 1,
    'the server never committed the request',
    20_000
  );
  lostSocket.destroy();
  const recovered = await lookup(lostBody.client_request_id);
  assert.equal(recovered.status, 'committed');
  assert.deepEqual(await create(lostBody), recovered.expense);
  assert.equal(
    await db
      .collection('expenses')
      .countDocuments({ trip: writerTrip._id, description: 'TEST lost response' }),
    1
  );
  pass('lost response: the commit survives, the key finds it and the retry repeats nothing');

  // The largest accepted amount stays exact from the preview to the settlement. Above it the
  // backend's cent rounding drifts (1e13 comes back as 1e13 + 0.01), which the requests refused
  // above must never have been able to store.
  const largestAmount = 1_000_000_000;
  const balancesOf = (settlement) =>
    new Map(settlement.balances.map((entry) => [entry.userId, toCents(entry.balance)]));
  const beforeLargest = await settlementOf(writerTrip._id, writerSession.accessToken);
  const largestPreview = await preview({ amount: largestAmount, member_ids: evenIds });
  assert.equal(largestPreview.amount, largestAmount);
  assert.deepEqual(sharesOf(largestPreview), evenFor(evenIds, toCents(largestAmount)));
  const largest = await create(
    payload({
      original_amount: largestAmount,
      description: 'TEST largest amount',
      splits: largestPreview.splits.map((split) => ({
        user_id: split.userId,
        share_amount: split.shareAmount,
      })),
    })
  );
  assert.deepEqual([largest.amount, largest.originalAmount], [largestAmount, largestAmount]);
  assert.deepEqual(
    largest.splits.map((split) => [split.userId, toCents(split.shareAmount)]),
    sharesOf(largestPreview)
  );
  const storedLargest = await db
    .collection('expenses')
    .findOne({ _id: new mongoose.Types.ObjectId(largest.id) });
  assert.deepEqual(
    [storedLargest.amount, storedLargest.originalAmount],
    [largestAmount, largestAmount]
  );
  assert.deepEqual(
    storedLargest.splits.map((split) => [String(split.user), toCents(split.shareAmount)]),
    sharesOf(largestPreview)
  );
  const afterLargest = await settlementOf(writerTrip._id, writerSession.accessToken);
  assert.equal(
    toCents(afterLargest.totalExpenses) - toCents(beforeLargest.totalExpenses),
    toCents(largestAmount)
  );
  const [balancesBefore, balancesAfter] = [balancesOf(beforeLargest), balancesOf(afterLargest)];
  const shareOf = new Map(sharesOf(largestPreview));
  for (const id of memberIds)
    assert.equal(
      (balancesAfter.get(id) ?? 0) - (balancesBefore.get(id) ?? 0),
      (id === writerId ? toCents(largestAmount) : 0) - (shareOf.get(id) ?? 0),
      `balance of ${id}`
    );
  pass('the largest amount is exact in the preview, the stored expense and the settlement');

  // Receipts as every earlier version stored them: the key in whatever case it was sent, and a
  // SHA-256 of the schema-parsed input. Built here without any of the server's code. After an
  // upgrade, a retry of such a request must find its receipt instead of creating the expense again,
  // whichever letter case the retry spells the key in.
  const alternate = (key, upperFirst) =>
    [...key.toLowerCase()]
      .map((char, index) => (index % 2 === (upperFirst ? 0 : 1) ? char.toUpperCase() : char))
      .join('');
  const spellingsOf = (key) => [
    key,
    key.toLowerCase(),
    key.toUpperCase(),
    alternate(key, true),
    alternate(key, false),
  ];
  const earlierFingerprint = (body) =>
    createHash('sha256')
      .update(
        JSON.stringify({
          client_request_id: body.client_request_id,
          payer_id: body.payer_id,
          original_amount: body.original_amount,
          currency: body.currency,
          exchange_rate: body.exchange_rate,
          description: body.description,
          category: body.category,
          date: body.date,
          splits: body.splits.map((split) => ({
            user_id: split.user_id,
            share_amount: split.share_amount,
          })),
        })
      )
      .digest('hex');
  const receiptsOfTrip = db.collection('expensecreaterequests');
  for (const earlierKey of [randomUUID().toUpperCase(), alternate(randomUUID(), true)]) {
    const earlierBody = payload({
      client_request_id: earlierKey,
      description: 'TEST earlier version',
    });
    const throwawayKey = randomUUID();
    const earlier = await create({ ...earlierBody, client_request_id: throwawayKey });
    const throwawayId = `${writerTrip._id}:${writerId}:${throwawayKey}`;
    const throwawayReceipt = await receiptsOfTrip.findOne({ _id: throwawayId });
    await receiptsOfTrip.deleteOne({ _id: throwawayId });
    await receiptsOfTrip.insertOne({
      _id: `${writerTrip._id}:${writerId}:${earlierKey}`,
      trip: writerTrip._id,
      fingerprint: earlierFingerprint(earlierBody),
      data: throwawayReceipt.data,
    });
    const beforeEarlier = await counts();
    for (const spelled of spellingsOf(earlierKey)) {
      assert.deepEqual(
        await create({ ...earlierBody, client_request_id: spelled }),
        earlier,
        `a replay of the earlier receipt stored as ${earlierKey}, key sent as ${spelled}`
      );
      assert.deepEqual(await lookup(spelled), { status: 'committed', expense: earlier }, spelled);
      const changed = await request(createPath, {
        token: writerSession.accessToken,
        body: { ...earlierBody, client_request_id: spelled, description: 'TEST changed' },
        status: 409,
      });
      assert.equal(changed.error.code, 'IDEMPOTENCY_CONFLICT', spelled);
    }
    assert.deepEqual(await counts(), beforeEarlier, 'replaying an earlier receipt writes nothing');
    const earlierObjectId = new mongoose.Types.ObjectId(earlier.id);
    await db.collection('expenses').deleteOne({ _id: earlierObjectId });
    for (const spelled of spellingsOf(earlierKey))
      assert.deepEqual(await create({ ...earlierBody, client_request_id: spelled }), earlier);
    assert.equal(await db.collection('expenses').countDocuments({ _id: earlierObjectId }), 0);
    assert.deepEqual(await lookup(earlierKey), { status: 'committed', expense: earlier });
  }
  pass('receipts stored by earlier versions replay in any letter case and never resurrect');

  // A key first sent with mixed letter case: the receipt keeps that spelling, and every other
  // spelling of the same UUID must still find it, replay it, be refused when the content changed
  // and never bring a deleted expense back (it used to create a second expense).
  const mixedKey = 'F47ac10B-58cc-4372-A567-0E02b2c3D479';
  const mixedBody = payload({ client_request_id: mixedKey, description: 'TEST mixed case' });
  const mixedCreated = await create(mixedBody);
  const beforeMixed = await counts();
  const mixedSpellings = [
    ...spellingsOf(mixedKey),
    'f47AC10b-58CC-4372-a567-0e02B2C3d479', // a second, different mixed spelling
  ];
  for (const spelled of mixedSpellings) {
    assert.deepEqual(
      await lookup(spelled),
      { status: 'committed', expense: mixedCreated },
      `lookup of ${spelled}`
    );
    assert.deepEqual(
      await create({ ...mixedBody, client_request_id: spelled }),
      mixedCreated,
      `a retry sent as ${spelled} replays the first request`
    );
    const changed = await request(createPath, {
      token: writerSession.accessToken,
      body: { ...mixedBody, client_request_id: spelled, description: 'TEST changed' },
      status: 409,
    });
    assert.equal(changed.error.code, 'IDEMPOTENCY_CONFLICT', spelled);
  }
  assert.deepEqual(await counts(), beforeMixed, 'every spelling of the key finds the one request');
  assert.equal(
    await receiptsOfTrip.countDocuments({
      _id: { $regex: `^${writerTrip._id}:${writerId}:${mixedKey}$`, $options: 'i' },
    }),
    1,
    'one receipt for all spellings'
  );
  assert(
    await receiptsOfTrip.findOne({ _id: `${writerTrip._id}:${writerId}:${mixedKey}` }),
    'the receipt keeps the spelling of the first request'
  );
  const mixedObjectId = new mongoose.Types.ObjectId(mixedCreated.id);
  await db.collection('expenses').deleteOne({ _id: mixedObjectId });
  for (const spelled of mixedSpellings)
    assert.deepEqual(
      await create({ ...mixedBody, client_request_id: spelled }),
      mixedCreated,
      `a deleted expense stays deleted when the retry is sent as ${spelled}`
    );
  assert.equal(await db.collection('expenses').countDocuments({ _id: mixedObjectId }), 0);
  assert.deepEqual(await counts(), { ...beforeMixed, expenses: beforeMixed.expenses - 1 });
  pass('a key first sent in mixed letter case is one key in every spelling, also after deletion');

  // E3: new entry uses the same C creation receipt, and maintenance never removes that receipt.
  const e3Body = payload({ description: 'E3 original' });
  const e3Expense = await create(e3Body);
  const e3Id = new mongoose.Types.ObjectId(e3Expense.id);
  const e3Path = `${tripPath}/expenses/${e3Expense.id}`;
  const e3Context = async () =>
    (
      await request(`${e3Path}/edit-context`, {
        token: writerSession.accessToken,
        schema: expenseEditContextSchema,
      })
    ).data;
  await request(`${e3Path}/edit-context`, { token: outsiderSession.accessToken, status: 404 });
  await db.collection('expenses').updateOne(
    { _id: e3Id },
    {
      $set: {
        currency: 'JPY',
        originalAmount: 400,
        exchangeRate: 0.25,
        tags: ['keep'],
        itineraryDays: [new mongoose.Types.ObjectId()],
        category: 'historical-category',
      },
    }
  );
  const e3Foreign = await e3Context();
  assert.equal(e3Foreign.category, 'historical-category');
  assert.equal(e3Foreign.capabilities.equal, false);
  assert(!JSON.stringify(e3Foreign).includes('attachments'));
  const beforeE3Basic = await db.collection('expenses').findOne({ _id: e3Id });
  const e3Basic = {
    client_request_id: randomUUID(),
    expected_revision: e3Foreign.revision,
    mode: 'basic',
    changes: { description: 'E3 metadata' },
  };
  await request(e3Path, {
    token: writerSession.accessToken,
    method: 'PATCH',
    body: e3Basic,
    schema: expenseMutationResultSchema,
  });
  const afterE3Basic = await db.collection('expenses').findOne({ _id: e3Id });
  for (const field of [
    'amount',
    'originalAmount',
    'currency',
    'exchangeRate',
    'payer',
    'splits',
    'category',
    'tags',
    'itineraryDays',
    'attachments',
    'createdAt',
    'createdBy',
  ])
    assert.deepEqual(afterE3Basic[field], beforeE3Basic[field], `metadata changed ${field}`);
  const e3Stale = {
    client_request_id: randomUUID(),
    expected_revision: (await e3Context()).revision,
    mode: 'basic',
    changes: { description: 'old confirmation' },
  };
  await db.collection('expenses').updateOne({ _id: e3Id }, { $set: { description: 'Web edit' } });
  assert.equal(
    (
      await request(e3Path, {
        token: writerSession.accessToken,
        method: 'PATCH',
        body: e3Stale,
        status: 409,
      })
    ).error.code,
    'RESOURCE_CHANGED'
  );
  assert.equal(
    (
      await request(`/mutation-requests/${e3Stale.client_request_id}`, {
        token: writerSession.accessToken,
        schema: mutationRequestSchema,
      })
    ).data.status,
    'rejected'
  );
  await db
    .collection('expenses')
    .updateOne({ _id: e3Id }, { $set: { currency: 'TWD', originalAmount: 100, exchangeRate: 1 } });
  const e3EqualPreview = await preview({ amount: 0.01, member_ids: evenIds });
  const e3Equal = {
    client_request_id: randomUUID(),
    expected_revision: (await e3Context()).revision,
    mode: 'equal',
    changes: {
      original_amount: 0.01,
      payer_id: writerId,
      splits: e3EqualPreview.splits.map((s) => ({
        user_id: s.userId,
        share_amount: s.shareAmount,
      })),
    },
  };
  const e3EqualResults = await Promise.all(
    Array.from({ length: 4 }, () =>
      request(e3Path, {
        token: writerSession.accessToken,
        method: 'PATCH',
        body: e3Equal,
        schema: expenseMutationResultSchema,
      })
    )
  );
  assert.deepEqual(
    e3EqualResults.map((r) => r.data),
    Array(4).fill(e3EqualResults[0].data)
  );
  assert.equal((await db.collection('expenses').findOne({ _id: e3Id })).amount, 0.01);
  const e3Lost = {
    client_request_id: randomUUID(),
    expected_revision: (await e3Context()).revision,
    mode: 'basic',
    changes: { description: 'E3 lost response' },
  };
  const e3LostSocket = connect(port, '127.0.0.1');
  e3LostSocket.on('error', () => {});
  await once(e3LostSocket, 'connect');
  const e3LostText = JSON.stringify(e3Lost);
  e3LostSocket.write(
    `PATCH /api/v1${e3Path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${writerSession.accessToken}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(e3LostText)}\r\nConnection: close\r\n\r\n${e3LostText}`
  );
  await eventually(
    async () =>
      (await db
        .collection('mutationrequests')
        .countDocuments({ _id: `${writerId}:${e3Lost.client_request_id}` })) === 1,
    'E3 lost response did not commit',
    20000
  );
  e3LostSocket.destroy();
  const e3LostResult = (
    await request(`/mutation-requests/${e3Lost.client_request_id}`, {
      token: writerSession.accessToken,
      schema: mutationRequestSchema,
    })
  ).data;
  assert.equal(e3LostResult.result.expenseId, e3Expense.id);
  assert.deepEqual(
    (
      await request(e3Path, {
        token: writerSession.accessToken,
        method: 'PATCH',
        body: e3Lost,
        schema: expenseMutationResultSchema,
      })
    ).data,
    e3LostResult.result
  );
  const e3Blob = `receipts/${writerTrip._id}/${randomUUID()}.jpg`;
  await db.collection('expenses').updateOne(
    { _id: e3Id },
    {
      $set: {
        attachments: [
          {
            key: e3Blob,
            contentType: 'image/jpeg',
            size: 1,
            uploadedBy: new mongoose.Types.ObjectId(writerId),
            uploadedAt: new Date(),
          },
        ],
      },
    }
  );
  await db
    .collection('comments')
    .insertOne({ trip: writerTrip._id, expense: e3Id, text: 'remove with expense' });
  const e3Delete = {
    client_request_id: randomUUID(),
    expected_revision: (await e3Context()).revision,
  };
  const e3Deleted = (
    await request(e3Path, {
      token: writerSession.accessToken,
      method: 'DELETE',
      body: e3Delete,
      schema: expenseMutationResultSchema,
    })
  ).data;
  assert.equal(e3Deleted.deleted, true);
  assert.deepEqual(
    (
      await request(e3Path, {
        token: writerSession.accessToken,
        method: 'DELETE',
        body: e3Delete,
        schema: expenseMutationResultSchema,
      })
    ).data,
    e3Deleted
  );
  assert.equal(await db.collection('comments').countDocuments({ expense: e3Id }), 0);
  assert.equal(await db.collection('blobcleanupjobs').countDocuments({ _id: e3Blob }), 1);
  assert.deepEqual(await create(e3Body), e3Expense);
  assert.equal(await db.collection('expenses').countDocuments({ _id: e3Id }), 0);
  const e3Gone = {
    ...e3Stale,
    client_request_id: randomUUID(),
    expected_revision: e3Delete.expected_revision,
  };
  assert.equal(
    (
      await request(e3Path, {
        token: writerSession.accessToken,
        method: 'PATCH',
        body: e3Gone,
        status: 409,
      })
    ).error.code,
    'RESOURCE_GONE'
  );
  assert.equal(
    (
      await request(`/mutation-requests/${e3Gone.client_request_id}`, {
        token: writerSession.accessToken,
        schema: mutationRequestSchema,
      })
    ).data.code,
    'RESOURCE_GONE'
  );
  pass(
    'E3: metadata preservation, Web conflict, equal tail cents, UUID concurrency, lost response, deletion/retirement and C replay never resurrects'
  );

  // E4 uses only this disposable writer trip; verify actual HTTP and committed row counts.
  for (const name of ['expenses', 'expensecreaterequests', 'payments', 'notifications', 'activitylogs'])
    await db.collection(name).deleteMany({ trip: writerTrip._id });
  await create(payload({ original_amount: 100, splits: [
    { user_id: writerId, share_amount: 50 }, { user_id: peerId, share_amount: 50 },
  ] }));
  const e4Context = async () => (await request(`${tripPath}/payment-context`, {
    token: writerSession.accessToken, schema: paymentContextSchema,
  })).data;
  const e4Path = `${tripPath}/payments`;
  const e4Post = async (body, status = 200) => (await request(e4Path, {
    token: writerSession.accessToken, body, status, ...(status === 200 ? { schema: paymentMutationResultSchema } : {}),
  })).data;
  const e4Initial = await e4Context();
  assert.equal(e4Initial.settlement.suggestedTransfers[0].amount, 50);
  assert(!JSON.stringify(e4Initial).includes('username'));
  for (const deniedToken of [undefined, outsiderSession.accessToken])
    await request(`${tripPath}/payment-context`, { token: deniedToken, status: deniedToken ? 404 : 401 });
  const e4Body = { client_request_id: randomUUID(), expected_revision: e4Initial.settlementRevision,
    from_id: peerId, to_id: writerId, amount: 20.01, note: ' partial ' };
  for (const invalid of [{ amount: 0.001 }, { amount: 1000000000.01 }, { to_id: peerId }, { currency: 'USD' }])
    await e4Post({ ...e4Body, ...invalid, client_request_id: randomUUID() }, 400);
  assert.equal(await db.collection('payments').countDocuments({ trip: writerTrip._id }), 0);
  const e4Results = await Promise.all(Array.from({ length: 4 }, () => e4Post(e4Body)));
  assert.deepEqual(e4Results, Array(4).fill(e4Results[0]));
  const e4Id = new mongoose.Types.ObjectId(e4Results[0].paymentId);
  assert.equal(await db.collection('payments').countDocuments({ trip: writerTrip._id }), 1);
  assert.equal(await db.collection('notifications').countDocuments({ trip: writerTrip._id, 'meta.payment_id': String(e4Id) }), 1);
  assert.equal(await db.collection('activitylogs').countDocuments({ trip: writerTrip._id, 'meta.payment_id': String(e4Id) }), 1);
  const e4After = await e4Context();
  assert.deepEqual(e4After.settlement, (await request(`${tripPath}/settlement`, { token: writerSession.accessToken, schema: settlementSchema })).data);
  assert.equal(e4After.settlement.balances.find((b) => b.userId === peerId).balance, -29.99);
  const e4Stale = { ...e4Body, client_request_id: randomUUID() };
  await e4Post(e4Stale, 409);
  assert.equal((await request(`/mutation-requests/${e4Stale.client_request_id}`, { token: writerSession.accessToken, schema: mutationRequestSchema })).data.code, 'SETTLEMENT_CHANGED');
  // Web-style edit with the same net totals invalidates an older confirmation too.
  await db.collection('expenses').updateOne({ trip: writerTrip._id }, { $set: { description: 'Web changed description' } });
  await e4Post({ ...e4Body, client_request_id: randomUUID(), expected_revision: e4After.settlementRevision }, 409);
  // Lose acknowledgements for both operations and resolve their durable UUID receipts.
  const e4Lost = { ...e4Body, client_request_id: randomUUID(), expected_revision: (await e4Context()).settlementRevision,
    from_id: writerId, to_id: virtualId, amount: 0.01, note: 'manual external payment' };
  const e4SocketWrite = async (method, path, body, token = writerSession.accessToken, accountId = writerId) => {
    const socket = connect(port, '127.0.0.1'); socket.on('error', () => {}); await once(socket, 'connect');
    const text = JSON.stringify(body);
    socket.write(`${method} /api/v1${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`);
    await eventually(async () => (await db.collection('mutationrequests').countDocuments({ _id: `${accountId}:${body.client_request_id}` })) === 1, 'E4 lost response did not commit', 20000);
    socket.destroy();
    return (await request(`/mutation-requests/${body.client_request_id}`, { token, schema: mutationRequestSchema })).data;
  };
  const e4LostResult = await e4SocketWrite('POST', e4Path, e4Lost);
  assert.deepEqual(await e4Post(e4Lost), e4LostResult.result);
  assert.equal(await db.collection('payments').countDocuments({ trip: writerTrip._id }), 2);
  const e4RemovePath = `${e4Path}/${e4Id}`;
  const e4Revoke = async () => (await request(`${e4RemovePath}/revoke-context`, { token: writerSession.accessToken, schema: paymentRevokeContextSchema })).data;
  const e4OldRemove = await e4Revoke();
  await db.collection('payments').updateOne({ _id: e4Id }, { $set: { note: 'Web revised note' } });
  const e4ConflictRemove = { client_request_id: randomUUID(), expected_revision: e4OldRemove.revision };
  assert.equal((await request(e4RemovePath, { token: writerSession.accessToken, method: 'DELETE', body: e4ConflictRemove, status: 409 })).data, undefined);
  const e4Remove = { client_request_id: randomUUID(), expected_revision: (await e4Revoke()).revision };
  const e4Removed = await e4SocketWrite('DELETE', e4RemovePath, e4Remove);
  assert.equal(e4Removed.result.deleted, true);
  assert.deepEqual((await request(e4RemovePath, { token: writerSession.accessToken, method: 'DELETE', body: e4Remove, schema: paymentMutationResultSchema })).data, e4Removed.result);
  assert.deepEqual(await e4Post(e4Body), e4Results[0]);
  assert.equal(await db.collection('payments').countDocuments({ _id: e4Id }), 0);
  await request(`${e4RemovePath}/revoke-context`, { token: writerSession.accessToken, status: 404 });
  pass('E4: partial/manual/virtual payments, cent validation, atomic UUID replay, stale settlement and revoke revisions, lost POST/DELETE acknowledgements, creation replay never resurrects');

  // G1b owns a separate fixture, leaving existing device member/ledger fixtures unchanged.
  const g1bTrip = new mongoose.Types.ObjectId(),
    g1bPath = `/trips/${g1bTrip}/members`;
  await db.collection('trips').insertOne({
    _id: g1bTrip,
    name: 'TEST G1b',
    hashCode: 'g1b-fixture',
    members: [
      { user: writer._id, role: 'admin', joinedAt: new Date() },
      { user: writerPeer._id, role: 'member', joinedAt: new Date() },
    ],
  });
  const g1bRead = async (token = writerSession.accessToken) =>
    (await request(g1bPath, { token, schema: tripMembersSchema })).data;
  const g1bOriginal = await g1bRead();
  assert(!/username|email|password|budget|hashCode/.test(JSON.stringify(g1bOriginal)));
  await request(g1bPath, { status: 401 });
  await request(g1bPath, { token: outsiderSession.accessToken, status: 404 });
  const g1bBody = {
    client_request_id: randomUUID(),
    expected_revision: g1bOriginal.revision,
    display_name: ' TEST virtual ',
  };
  await request(g1bPath, {
    token: writerSession.accessToken,
    body: { ...g1bBody, role: 'admin' },
    status: 400,
  });
  await request(g1bPath, {
    token: peerSession.accessToken,
    body: { ...g1bBody, client_request_id: randomUUID() },
    status: 403,
  });
  const g1bResult = await e4SocketWrite('POST', g1bPath, g1bBody);
  assert.equal(g1bResult.operation, 'member.create');
  const g1bMember = new mongoose.Types.ObjectId(g1bResult.result.memberId);
  const g1bReplays = await Promise.all(
    Array.from(
      { length: 3 },
      async () =>
        (
          await request(g1bPath, {
            token: writerSession.accessToken,
            body: g1bBody,
            schema: memberMutationResultSchema,
          })
        ).data
    )
  );
  assert.deepEqual(g1bReplays, Array(3).fill(g1bResult.result));
  assert.equal((await g1bRead()).members.filter((m) => m.isVirtual).length, 1);
  assert.equal(await db.collection('users').countDocuments({ _id: g1bMember }), 1);
  await request(g1bPath, {
    token: writerSession.accessToken,
    body: { ...g1bBody, client_request_id: randomUUID() },
    status: 409,
  });
  const g1bRename = {
    client_request_id: randomUUID(),
    expected_revision: (await g1bRead()).revision,
    display_name: 'Renamed virtual',
  };
  const g1bRenameResult = await e4SocketWrite('PATCH', `${g1bPath}/${g1bMember}`, g1bRename);
  assert.equal(g1bRenameResult.operation, 'member.rename');
  assert.equal(
    (await g1bRead()).members.find((m) => m.id === String(g1bMember)).displayName,
    'Renamed virtual'
  );
  assert.deepEqual(
    (
      await request(`${g1bPath}/${g1bMember}`, {
        token: writerSession.accessToken,
        method: 'PATCH',
        body: g1bRename,
        schema: memberMutationResultSchema,
      })
    ).data,
    g1bRenameResult.result
  );
  const g1bOptions = (
    await request(`/trips/${g1bTrip}/expense-options`, {
      token: writerSession.accessToken,
      schema: expenseOptionsSchema,
    })
  ).data;
  assert.equal(g1bOptions.members.find((m) => m.id === String(g1bMember)).isVirtual, true);
  await db
    .collection('trips')
    .updateOne(
      { _id: g1bTrip, 'members.user': writer._id },
      { $set: { 'members.$.role': 'member' } }
    );
  await request(g1bPath, {
    token: writerSession.accessToken,
    body: {
      ...g1bBody,
      client_request_id: randomUUID(),
      expected_revision: (await g1bRead()).revision,
    },
    status: 403,
  });
  assert.deepEqual(
    (
      await request(`/mutation-requests/${g1bBody.client_request_id}`, {
        token: writerSession.accessToken,
        schema: mutationRequestSchema,
      })
    ).data,
    g1bResult
  );
  await db
    .collection('trips')
    .updateOne({ _id: g1bTrip }, { $pull: { members: { user: writer._id } } });
  await request(g1bPath, { token: writerSession.accessToken, status: 404 });
  await request(`/mutation-requests/${g1bBody.client_request_id}`, {
    token: writerSession.accessToken,
    status: 404,
  });
  await db.collection('users').deleteOne({ _id: g1bMember });
  await db.collection('trips').deleteOne({ _id: g1bTrip });
  await db
    .collection('mutationrequests')
    .deleteMany({
      $or: [{ 'terminal.tripId': String(g1bTrip) }, { 'terminal.result.tripId': String(g1bTrip) }],
    });
  pass(
    'G1b: authorized roster, strict virtual creation/rename, dropped responses, UUID replay, one user/member, role loss and revoked receipt access'
  );

  // G1c uses its own disposable trip. A successful exit receipt is deliberately readable
  // after membership loss, while every roster/ledger/other receipt remains denied.
  const g1cTrip = new mongoose.Types.ObjectId(), g1cVirtual = new mongoose.Types.ObjectId();
  const g1cPath = `/trips/${g1cTrip}/access`, g1cMembers = `/trips/${g1cTrip}/members`;
  await db.collection('users').insertOne({ _id: g1cVirtual, username: `virtual_${g1cVirtual}`, displayName: 'G1c virtual', isVirtual: true, email: `g1c_${g1cVirtual}@virtual.local`, password: 'fixture' });
  await db.collection('trips').insertOne({ _id: g1cTrip, name: 'TEST G1c', hashCode: 'g1c-fixture', members: [{ user: writer._id, role: 'admin' }, { user: writerPeer._id, role: 'member' }, { user: g1cVirtual, role: 'member' }] });
  await db.collection('expenses').insertOne({ trip: g1cTrip, payer: g1cVirtual, amount: 12.34, splits: [{ user: g1cVirtual, shareAmount: 12.34 }] });
  await db.collection('payments').insertOne({ trip: g1cTrip, from: writer._id, to: g1cVirtual, amount: 1.23 });
  const g1cRead = async (token = writerSession.accessToken) => (await request(g1cPath, { token, schema: tripAccessContextSchema })).data;
  const g1cOriginal = await g1cRead();
  assert(!/username|email|password|budget|hashCode/.test(JSON.stringify(g1cOriginal)));
  assert.equal(g1cOriginal.canLeave, false);
  assert.equal(g1cOriginal.expenseCount, 1);
  const g1cClaim = (await request(`${g1cMembers}/${g1cVirtual}/claim-invitation`, { token: writerSession.accessToken, schema: memberClaimInvitationSchema })).data;
  assert.equal(new URL(g1cClaim.url).pathname, `/link-virtual/g1c-fixture/virtual_${g1cVirtual}`);
  await request(`${g1cMembers}/${g1cVirtual}/claim-invitation`, { token: peerSession.accessToken, status: 403 });
  const g1cDelete = { action: 'delete', client_request_id: randomUUID(), expected_revision: g1cOriginal.accessRevision };
  await request(g1cPath, { token: writerSession.accessToken, body: { ...g1cDelete, role: 'admin' }, status: 400 });
  await request(g1cPath, { token: peerSession.accessToken, body: { ...g1cDelete, client_request_id: randomUUID() }, status: 403 });
  const g1cRole = { action: 'role', member_id: peerId, role: 'admin', client_request_id: randomUUID(), expected_revision: (await g1cRead()).accessRevision };
  await request(g1cPath, { token: writerSession.accessToken, body: g1cRole, schema: tripAccessResultSchema });
  await request(g1cPath, { token: writerSession.accessToken, body: g1cDelete, status: 409 });
  const g1cRemove = { action: 'remove', member_id: String(g1cVirtual), client_request_id: randomUUID(), expected_revision: (await g1cRead()).accessRevision };
  await request(g1cPath, { token: writerSession.accessToken, body: g1cRemove, schema: tripAccessResultSchema });
  assert.equal(await db.collection('expenses').countDocuments({ trip: g1cTrip, payer: g1cVirtual }), 1);
  assert.equal(await db.collection('payments').countDocuments({ trip: g1cTrip, to: g1cVirtual }), 1);
  assert.equal(await db.collection('users').countDocuments({ _id: g1cVirtual }), 1);
  await request(`${g1cMembers}/${g1cVirtual}/claim-invitation`, { token: writerSession.accessToken, status: 409 });
  const g1cLeave = { action: 'leave', client_request_id: randomUUID(), expected_revision: (await g1cRead()).accessRevision };
  const g1cLeft = await e4SocketWrite('POST', g1cPath, g1cLeave);
  assert.deepEqual(g1cLeft.result, { tripId: String(g1cTrip), action: 'leave', exited: true });
  assert.deepEqual((await request(g1cPath, { token: writerSession.accessToken, body: g1cLeave, schema: tripAccessResultSchema })).data, g1cLeft.result);
  await request(g1cPath, { token: writerSession.accessToken, status: 404 });
  await request(`/mutation-requests/${g1cRole.client_request_id}`, { token: writerSession.accessToken, status: 404 });
  const g1cDestroy = { action: 'delete', client_request_id: randomUUID(), expected_revision: (await g1cRead(peerSession.accessToken)).accessRevision };
  const g1cDeleted = await e4SocketWrite('POST', g1cPath, g1cDestroy, peerSession.accessToken, peerId);
  assert.deepEqual(g1cDeleted.result, { tripId: String(g1cTrip), action: 'delete', exited: true });
  assert.deepEqual((await request(g1cPath, { token: peerSession.accessToken, body: g1cDestroy, schema: tripAccessResultSchema })).data, g1cDeleted.result);
  for (const name of ['expenses','payments','trips']) assert.equal(await db.collection(name).countDocuments(name === 'trips' ? { _id: g1cTrip } : { trip: g1cTrip }), 0);
  assert.equal(await db.collection('tripcleanupjobs').countDocuments({ _id: g1cTrip }), 1);
  await db.collection('tripcleanupjobs').deleteOne({ _id: g1cTrip });
  await db.collection('users').deleteOne({ _id: g1cVirtual });
  await db.collection('mutationrequests').deleteMany({ $or: [{ 'terminal.tripId': String(g1cTrip) }, { 'terminal.result.tripId': String(g1cTrip) }] });
  pass('G1c: role/removal, preserved accounting, claim capability, last admin, stale deletion, lost leave/delete responses, minimal exit receipt replay');

  // Return the trip to its pristine state for device testing.
  for (const name of ['expenses', 'expensecreaterequests', 'payments', 'notifications', 'activitylogs'])
    await db.collection(name).deleteMany({ trip: writerTrip._id });
  const rotated = (await refresh(first)).data;
  assert.notEqual(rotated.refreshToken, first.refreshToken);
  await me(rotated);
  await refresh(first, 401);
  await me(rotated, 401);
  await me(other);
  // E2 uses only isolated accounts; mail is unconfigured. Seed a known hash in this disposable DB.
  const e2Body = {
    username: ' mobile-e2 ',
    display_name: ' E2 user ',
    email: ' MOBILE-E2@EXAMPLE.INVALID ',
    password: ' 密碼123 ',
  };
  const e2Created = await request('/auth/register', { body: e2Body, schema: userSchema });
  assert.equal(e2Created.data.username, 'mobile-e2');
  assert.equal(e2Created.response.headers.get('set-cookie'), null);
  assert.equal(
    await db
      .collection('mobilesessions')
      .countDocuments({ user: new mongoose.Types.ObjectId(e2Created.data.id) }),
    0
  );
  await request('/auth/register', {
    body: { ...e2Body, username: 'MOBILE-E2', email: 'other-e2@example.invalid' },
    status: 409,
  });
  await request('/auth/register', {
    body: { ...e2Body, username: 'other-e2', email: 'mobile-e2@example.invalid' },
    status: 409,
  });
  await request('/auth/register', { body: { ...e2Body, password: '中'.repeat(25) }, status: 400 });
  const e2Old = (
    await request('/auth/login', {
      body: { username: 'mobile-e2', password: e2Body.password },
      schema: sessionSchema,
    })
  ).data;
  const e2Email = 'mobile-e2@example.invalid';
  const e2UserId = new mongoose.Types.ObjectId(e2Created.data.id);
  const acceptedKnown = await request('/auth/password-reset/request', { body: { email: e2Email } });
  const acceptedUnknown = await request('/auth/password-reset/request', {
    body: { email: 'unknown-e2@example.invalid' },
  });
  assert.deepEqual(acceptedKnown.data, acceptedUnknown.data);
  for (const email of [e2Email, 'unknown-e2@example.invalid']) {
    const limited = await request('/auth/password-reset/request', { body: { email }, status: 429 });
    assert(+limited.response.headers.get('retry-after') > 0);
  }
  await db
    .collection('passwordresetcodes')
    .updateOne(
      { user: e2UserId },
      { $set: { codeHash: createHash('sha256').update('000007').digest('hex') } }
    );
  const e2Reset = { email: e2Email, code: '000007', new_password: 'E2-new-password' };
  const e2Concurrent = await Promise.all(
    Array.from({ length: 2 }, async () => {
      const response = await fetch(`${origin}/api/v1/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(e2Reset),
      });
      return response.status;
    })
  );
  assert.deepEqual(e2Concurrent.sort(), [200, 400]);
  assert.equal(await db.collection('passwordresetcodes').countDocuments({ user: e2UserId }), 0);
  await me(e2Old, 401);
  await refresh(e2Old, 401);
  const e2New = (
    await request('/auth/login', {
      body: { username: 'MOBILE-E2', password: e2Reset.new_password },
      schema: sessionSchema,
    })
  ).data;
  await me(e2New);
  // Lost reset acknowledgement: observe commit in the isolated DB, discard the socket, then log in.
  await db
    .collection('passwordresetcodes')
    .insertOne({
      user: e2UserId,
      codeHash: createHash('sha256').update('000008').digest('hex'),
      attempts: 0,
      expiresAt: new Date(Date.now() + 900000),
    });
  const e2Lost = { ...e2Reset, code: '000008', new_password: 'E2-after-lost-response' };
  const e2Socket = connect(port, '127.0.0.1');
  e2Socket.on('error', () => {});
  await once(e2Socket, 'connect');
  const e2Text = JSON.stringify(e2Lost);
  e2Socket.write(
    `POST /api/v1/auth/password-reset/confirm HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(e2Text)}\r\nConnection: close\r\n\r\n${e2Text}`
  );
  await eventually(
    async () =>
      (await db.collection('passwordresetcodes').countDocuments({ user: e2UserId })) === 0,
    'E2 lost reset did not commit',
    20000
  );
  e2Socket.destroy();
  const e2Recovered = (
    await request('/auth/login', {
      body: { username: 'mobile-e2', password: e2Lost.new_password },
      schema: sessionSchema,
    })
  ).data;
  await me(e2Recovered);
  assert.equal(await db.collection('users').countDocuments({ _id: e2UserId }), 1);
  pass(
    'E2: anonymous registration, unique fields, UTF-8 boundary, identical send acceptance/rate limit, one concurrent reset, old session invalidation, lost-response login recovery'
  );
  // E1: real HTTP, replica-set transactions and database counts, no production service.
  const eTransactions = await exec('pnpm', ['exec', 'vitest', 'run', 'src/__tests__/tripEntry.integration.test.ts'], { env: { ...process.env, MONGODB_E1_TEST_URI: uri, MONGODB_E1_TEST_ALLOW_WRITES: '1' }, maxBuffer: 1024 * 1024 });
  assert(eTransactions.stdout.includes('5 passed'), 'E1 transaction cases did not run');
  pass('E1 real transaction rollback, competing terminal results and post-commit effect failures');
  const eCreator = await login('mobile-empty');
  const eJoiner = await login('mobile-b');
  const eCreate = { client_request_id: randomUUID(), name: 'TEST E1', description: ' Entry ', start_date: '2024-02-29', end_date: '2025-01-01' };
  const eRequest = (path, body, token = eCreator.accessToken, status = 200) => request(path, { body, token, status });
  const eAccepted = await Promise.all(Array.from({ length: 6 }, () => eRequest('/trips', eCreate)));
  assert(eAccepted.every(r => r.data.tripId === eAccepted[0].data.tripId));
  const eTripId = new mongoose.Types.ObjectId(eAccepted[0].data.tripId);
  const eTrip = await db.collection('trips').findOne({ _id: eTripId });
  assert.equal(eTrip.members.length, 1); assert.equal(eTrip.members[0].role, 'admin');
  assert.equal(eTrip.description, 'Entry'); assert.match(eTrip.hashCode, /^[a-z0-9]{8}$/);
  assert.equal(await db.collection('trips').countDocuments({ name: 'TEST E1' }), 1);
  assert.equal(await db.collection('mutationrequests').countDocuments({ _id: `${eCreator.user.id}:${eCreate.client_request_id}` }), 1);
  const eLanding = await request(`/trips/${eTripId}/landing`, { token: eCreator.accessToken });
  assert.equal(eLanding.data.mySpent, 0); assert.equal(eLanding.data.myBalance, 0);
  assert.equal('code' in eLanding.data, false); assert.equal('hashCode' in eLanding.data, false);
  const invitation = (await eRequest(`/trips/${eTripId}/invitation`)).data;
  assert.deepEqual(invitation, { code: eTrip.hashCode, url: `${origin}/join/${eTrip.hashCode}` });
  await eRequest(`/trips/${eTripId}/invitation`, undefined, eJoiner.accessToken, 404);
  await eRequest('/trips', { ...eCreate, name: 'Changed' }, eCreator.accessToken, 409);
  await eRequest('/trips/join', { client_request_id: eCreate.client_request_id, invite_code: eTrip.hashCode }, eCreator.accessToken, 409);
  for (const invalid of [{ name: '   ' }, { name: 'x'.repeat(101) }, { start_date: '2025-02-29' }, { start_date: '2026-01-02', end_date: '2026-01-01' }, { destination: 'Tokyo' }]) await eRequest('/trips', { ...eCreate, client_request_id: randomUUID(), ...invalid }, eCreator.accessToken, 400);
  for (const dates of [[null, null], [null, '2026-01-01'], ['2026-01-01', null]]) await eRequest('/trips', { ...eCreate, client_request_id: randomUUID(), name: 'TEST E1 optional', start_date: dates[0], end_date: dates[1] });
  const eJoin = { client_request_id: randomUUID(), invite_code: eTrip.hashCode.toUpperCase() };
  const joined = await Promise.all(Array.from({ length: 6 }, () => eRequest('/trips/join', eJoin, eJoiner.accessToken)));
  assert(joined.every(r => r.data.tripId === eTripId.toString() && r.data.alreadyMember === false));
  assert.equal((await db.collection('trips').findOne({ _id: eTripId })).members.length, 2);
  assert.equal(await db.collection('activitylogs').countDocuments({ trip: eTripId, type: 'member_joined' }), 1);
  assert.equal(await db.collection('notifications').countDocuments({ trip: eTripId, type: 'member_joined' }), 1);
  assert.equal((await eRequest('/trips/join', { ...eJoin, client_request_id: randomUUID() }, eJoiner.accessToken)).data.alreadyMember, true);
  assert.equal(await db.collection('activitylogs').countDocuments({ trip: eTripId }), 1);
  await db.collection('trips').updateOne({ _id: eTripId }, { $pull: { members: { user: new mongoose.Types.ObjectId(eJoiner.user.id) } } });
  await eRequest('/trips/join', eJoin, eJoiner.accessToken, 404);
  await eRequest(`/mutation-requests/${eJoin.client_request_id}`, undefined, eJoiner.accessToken, 404);
  assert.equal((await db.collection('trips').findOne({ _id: eTripId })).members.length, 1);
  await db.collection('trips').updateOne({ _id: eTripId }, { $set: { hashCode: 'abc123' } });
  const invalidJoin = { client_request_id: randomUUID(), invite_code: eTrip.hashCode };
  await eRequest('/trips/join', invalidJoin, eJoiner.accessToken, 404);
  assert.equal((await eRequest(`/mutation-requests/${invalidJoin.client_request_id}`, undefined, eJoiner.accessToken)).data.status, 'rejected');
  await eRequest('/trips/join', { client_request_id: randomUUID(), invite_code: eTripId.toString() }, eJoiner.accessToken, 400);
  await eRequest('/trips/join', { client_request_id: randomUUID(), invite_code: 'abc123' }, eJoiner.accessToken);
  // A dropped acknowledgement is recovered by the same account UUID, never name matching.
  const eLost = { ...eCreate, client_request_id: randomUUID(), name: 'TEST E1 lost' };
  const eSocket = connect(port, '127.0.0.1'); eSocket.on('error', () => {}); await once(eSocket, 'connect');
  const eText = JSON.stringify(eLost);
  eSocket.write(`POST /api/v1/trips HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${eCreator.accessToken}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(eText)}\r\nConnection: close\r\n\r\n${eText}`);
  await eventually(async () => await db.collection('mutationrequests').countDocuments({ _id: `${eCreator.user.id}:${eLost.client_request_id}` }) === 1, 'E1 dropped response never committed', 20000);
  eSocket.destroy();
  const eRecovered = (await eRequest(`/mutation-requests/${eLost.client_request_id}`)).data;
  assert.equal(eRecovered.status, 'committed');
  assert.equal((await eRequest('/trips', eLost)).data.tripId, eRecovered.resourceId);
  assert.equal(await db.collection('trips').countDocuments({ name: 'TEST E1 lost' }), 1);
  assert.equal((await eRequest(`/mutation-requests/${eLost.client_request_id}`, undefined, eJoiner.accessToken)).data.status, 'not_found');
  await db.collection('trips').deleteOne({ _id: new mongoose.Types.ObjectId(eRecovered.resourceId) });
  await eRequest(`/mutation-requests/${eLost.client_request_id}`, undefined, eCreator.accessToken, 404);
  await eRequest('/trips', eLost, eCreator.accessToken, 404);
  assert.equal(await db.collection('mutationrequests').countDocuments({ _id: `${eCreator.user.id}:${eLost.client_request_id}` }), 1);
  pass('E1: create/join receipts, concurrent membership/effect dedupe, invitation privacy, revoked/deleted replay, old code, strict dates, dropped response');
  // Keep --serve's established empty-account/ledger fixtures pristine for C/D device suites.
  const eFixtureTrips = await db.collection('trips').find({ name: /^TEST E1/, 'members.user': new mongoose.Types.ObjectId(eCreator.user.id) }, { projection: { _id: 1 } }).toArray();
  const eTripIds = eFixtureTrips.map(trip => trip._id);
  for (const name of ['notifications', 'activitylogs']) await db.collection(name).deleteMany({ trip: { $in: eTripIds } });
  await db.collection('trips').deleteMany({ _id: { $in: eTripIds } });
  await db.collection('mutationrequests').deleteMany({});
  assert.equal(await db.collection('trips').countDocuments({ 'members.user': new mongoose.Types.ObjectId(eCreator.user.id) }), 0);


  const concurrent = await login();
  const races = await Promise.all(
    [0, 1].map(() =>
      fetch(`${origin}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: concurrent.refreshToken }),
        signal: AbortSignal.timeout(60_000),
      })
    )
  );
  assert.deepEqual(races.map((res) => res.status).sort(), [200, 401]);
  await me(concurrent, 401);
  pass('atomic rotation, replay revocation and independent device sessions');
  const expired = await login();
  await db
    .collection('mobilesessions')
    .updateOne(
      { _id: new mongoose.Types.ObjectId(decodeJwt(expired.accessToken).sid) },
      { $set: { expiresAt: new Date(0) } }
    );
  await me(expired, 401);
  await refresh(expired, 401);
  const changed = await login();
  await db
    .collection('users')
    .updateOne({ _id: users[0]._id }, { $set: { password: await bcrypt.hash(randomUUID(), 10) } });
  await me(changed, 401);
  await refresh(changed, 401);
  await db.collection('users').updateOne({ _id: users[0]._id }, { $set: { password: hash } });
  pass('database expiry and password change invalidate access and refresh');
  const webToken = await new SignJWT({
    userId: users[0]._id.toString(),
    username: users[0].username,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(jwtSecret));
  const loggedOut = await login();
  await request('/me', { token: webToken, status: 401 });
  await request('/me', { headers: { Cookie: `session=${webToken}` }, status: 401 });
  async function webRedirect(token) {
    return fetch(`${origin}/login`, {
      redirect: 'manual',
      headers: { Cookie: `session=${token}` },
      signal: AbortSignal.timeout(60_000),
    });
  }
  assert.equal(
    new URL((await webRedirect(webToken)).headers.get('location'), origin).pathname,
    '/trips'
  );
  assert.equal(
    new URL((await webRedirect(loggedOut.accessToken)).headers.get('location'), origin).pathname,
    '/'
  );
  await request('/auth/logout', { body: { refreshToken: loggedOut.refreshToken } });
  await me(loggedOut, 401);
  await me(other);
  assert.equal(
    new URL((await webRedirect(webToken)).headers.get('location'), origin).pathname,
    '/trips'
  );
  pass('mobile logout and Web cookie isolation');
  for (let i = 0; i < 10; i++)
    await request('/auth/login', {
      body: { username: 'mobile-rate', password: 'wrong' },
      status: 401,
    });
  const limited = await request('/auth/login', {
    body: { username: 'mobile-rate', password },
    status: 429,
  });
  assert(Number(limited.response.headers.get('retry-after')) > 0);
  pass('login rate limit and Retry-After');
  // Return fresh fixtures for device testing; automated acceptance must not consume their quota.
  await db.collection('mobilesessions').deleteMany({});
  await db.collection('mobileloginattempts').deleteMany({});
  console.log(
    'HTTP/MongoDB acceptance passed. Native UI and SecureStore still require device checks.'
  );
  if (args.has('--serve')) {
    // This control channel exists only in the disposable harness, never in Next routes.
    const controlToken = randomBytes(32).toString('hex');
    const activeSessions = (user) => ({
      user: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    const sessionCommand = (user, change) => async () => {
      const result = await db
        .collection('mobilesessions')
        .updateMany(activeSessions(user), { $set: change() });
      return { affectedSessions: result.modifiedCount };
    };
    const membershipOf = (user) =>
      writerTrip.members.find((entry) => String(entry.user) === String(user._id));
    const leave = (user) => async () => {
      await db
        .collection('trips')
        .updateOne({ _id: writerTrip._id }, { $pull: { members: { user: user._id } } });
      return {};
    };
    const rejoin = (user) => async () => {
      await db
        .collection('trips')
        .updateOne(
          { _id: writerTrip._id, 'members.user': { $ne: user._id } },
          { $push: { members: membershipOf(user) } }
        );
      return {};
    };
    // What the Writer trip holds, for device runs to compare with what the app reported.
    const entryState = async () => {
      const filter = { trip: writerTrip._id };
      const stored = await db.collection('expenses').find(filter).sort({ createdAt: 1 }).toArray();
      return {
        expenses: stored.length,
        receipts: await db.collection('expensecreaterequests').countDocuments(filter),
        notifications: await db.collection('notifications').countDocuments(filter),
        activity: await db.collection('activitylogs').countDocuments(filter),
        descriptions: stored.map((expense) => expense.description),
        amounts: stored.map((expense) => expense.amount),
      };
    };
    const fixtureCommands = {
      'reset-limits': async () => {
        await db.collection('mobileloginattempts').deleteMany({});
        return {};
      },
      'revoke-a': sessionCommand(users[0], () => ({ revokedAt: new Date() })),
      'expire-a': sessionCommand(users[0], () => ({ expiresAt: new Date(0) })),
      'revoke-writer': sessionCommand(writer, () => ({ revokedAt: new Date() })),
      'expire-writer': sessionCommand(writer, () => ({ expiresAt: new Date(0) })),
      // The writer, or the removable member, loses and regains membership of the Writer trip.
      'writer-leave': leave(writer),
      'writer-rejoin': rejoin(writer),
      'removed-leave': leave(writerRemoved),
      'removed-rejoin': rejoin(writerRemoved),
      'entry-state': entryState,
      // Back to a pristine Writer trip: no expenses, receipts or side effects, writer is a member.
      'entry-reset': async () => {
        for (const name of ['expenses', 'expensecreaterequests', 'notifications', 'activitylogs'])
          await db.collection(name).deleteMany({ trip: writerTrip._id });
        await fixtureCommands['writer-rejoin']();
        await fixtureCommands['removed-rejoin']();
        return entryState();
      },
    };
    async function fixtureCommand(command) {
      assert(Object.hasOwn(fixtureCommands, command), 'Unknown fixture command');
      return fixtureCommands[command]();
    }
    function enqueueCommand(command) {
      const result = commandQueue.then(() => fixtureCommand(command));
      commandQueue = result.catch(() => {});
      return result;
    }
    control = createHttpServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      const reply = (status, body) => {
        res.writeHead(status);
        res.end(JSON.stringify(body));
      };
      if (req.headers.authorization !== `Bearer ${controlToken}`)
        return reply(401, { error: 'Unauthorized' });
      if (req.method === 'GET' && req.url === '/health')
        return reply(200, { apiUrl: `${origin}/api/v1` });
      if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });
      const command = req.url.slice(1);
      if (!Object.hasOwn(fixtureCommands, command))
        return reply(404, { error: 'Unknown fixture command' });
      try {
        reply(200, await enqueueCommand(command));
      } catch {
        reply(500, { error: 'Local fixture command failed' });
      }
    });
    await new Promise((resolve, reject) => {
      control.once('error', reject);
      control.listen(0, '127.0.0.1', resolve);
    });
    const controlUrl = `http://127.0.0.1:${control.address().port}`;
    const controlHeaders = { Authorization: `Bearer ${controlToken}` };
    // Verify the test channel cannot mutate fixtures without its separate credential.
    for (const headers of [{}, { Authorization: 'Bearer incorrect' }]) {
      assert.equal(
        (await fetch(`${controlUrl}/revoke-a`, { method: 'POST', headers })).status,
        401
      );
    }
    assert.equal((await fetch(`${controlUrl}/revoke-a`, { headers: controlHeaders })).status, 405);
    assert.equal(
      (await fetch(`${controlUrl}/quit`, { method: 'POST', headers: controlHeaders })).status,
      404
    );
    assert.deepEqual(
      await (await fetch(`${controlUrl}/health`, { headers: controlHeaders })).json(),
      { apiUrl: `${origin}/api/v1` }
    );
    pass('authenticated loopback fixture control');
    console.log(`\nAPI: ${origin}/api/v1\nAndroid emulator: http://10.0.2.2:${port}/api/v1`);
    if (args.has('--lan'))
      for (const addresses of Object.values(networkInterfaces())) {
        for (const address of addresses ?? [])
          if (address.family === 'IPv4' && !address.internal)
            console.log(`LAN candidate: http://${address.address}:${port}/api/v1`);
      }
    console.log(
      `Disposable accounts: mobile-a, mobile-b, mobile-empty, mobile-ledger, mobile-ledger-b, mobile-removed, mobile-writer, mobile-writer-b, mobile-writer-removed, mobile-writer-out\nPassword: ${password}`
    );
    console.log(
      `Shared trip: ${shared._id}\nB-only trip: ${privateTrip._id}\nLedger trip (48 expenses): ${ledger._id}\nEmpty ledger: ${emptyLedger._id}\nSettled ledger: ${settledLedger._id}\nWriter trip (mobile-writer, mobile-writer-b, mobile-writer-removed): ${writerTrip._id}\nFixture date: ${date}\nStop with Ctrl+C to remove the database and server.`
    );
    await writeFile(
      join(artifacts, 'fixture.json'),
      JSON.stringify({
        apiUrl: `${origin}/api/v1`,
        container,
        database: dbName,
        password,
        sharedTrip: String(shared._id),
        privateTrip: String(privateTrip._id),
        ledgerTrip: String(ledger._id),
        emptyLedgerTrip: String(emptyLedger._id),
        settledLedgerTrip: String(settledLedger._id),
        writerTrip: String(writerTrip._id),
        writerMembers: {
          writer: String(writer._id),
          peer: String(writerPeer._id),
          virtual: String(writerVirtual._id),
          removed: String(writerRemoved._id),
        },
        date,
        controlUrl,
        controlToken,
        ...(mailbox ? { mailboxUrl: mailbox.url, mailboxToken: mailbox.token } : {}),
      }),
      { mode: 0o600 }
    );
    console.log(`Local fixture details: ${join(artifacts, 'fixture.json')}`);
    const commandList = `${Object.keys(fixtureCommands).join(', ')}, quit`;
    console.log(`Commands: ${commandList}`);
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    terminal.on('line', (line) => {
      const command = line.trim();
      if (command === 'quit') return onSignal();
      if (!Object.hasOwn(fixtureCommands, command)) {
        console.log(`Commands: ${commandList}`);
        return;
      }
      void enqueueCommand(command)
        .then((result) =>
          console.log(
            `DONE ${command}${command === 'entry-state' ? ` ${JSON.stringify(result)}` : ''}`
          )
        )
        .catch(() => {
          console.error('Local fixture command failed');
        });
    });
    if (!stopping) await Promise.race([once(stop.signal, 'abort'), once(app, 'exit')]);
    if (!stopping) throw new Error('Next.js exited during device testing');
  }
} catch (error) {
  if (!stopping) {
    console.error(error.message);
    process.exitCode = 1;
  }
} finally {
  terminal?.close();
  if (control) await new Promise((resolve) => control.close(resolve));
  await commandQueue;
  if (app?.pid) {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    await Promise.race([once(app, 'exit'), delay(5000)]);
    try {
      process.kill(-app.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await mongo?.close();
  await mailbox?.close();
  // Unique generated container name is the only cleanup target, including partial startup.
  await exec('docker', ['rm', '--force', container]).catch(() => {});
  await writeFile(join(artifacts, 'next.log'), appLog, { mode: 0o600 });
  console.log(`Local diagnostic log: ${join(artifacts, 'next.log')}`);
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
