/** Disposable local HTTP/MongoDB acceptance environment. Never accepts an external DB URI. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { SignJWT, decodeJwt } from 'jose';
import { sessionSchema, userSchema, tripsSchema, landingSchema } from '@travel-budget/contracts';
import { up as migrateSessions } from '../migrations/20261002100000-mobile-session-expiry.js';

const args = new Set(process.argv.slice(2));
assert(
  [...args].every((arg) => ['--serve', '--lan'].includes(arg)),
  'Use --serve [--lan]'
);
assert(!args.has('--lan') || args.has('--serve'), '--lan requires --serve');
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
const pass = (name) => console.log(`PASS ${name}`);
try {
  await exec('docker', ['info', '--format', '{{.ServerVersion}}']);
  console.log('Starting disposable local MongoDB');
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
  const db = mongo.db(dbName);
  await migrateSessions(db);
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
  Object.assign(env, {
    NODE_ENV: 'development',
    MONGODB_URI: uri,
    JWT_SECRET: jwtSecret,
    APP_URL: origin,
    NEXT_TELEMETRY_DISABLED: '1',
    EXPENSE_BACKGROUND_DELIVERY: 'off',
    RESEND_API_KEY: '',
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
      if (schema) schema.strict().parse(payload.data);
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
  const rotated = (await refresh(first)).data;
  assert.notEqual(rotated.refreshToken, first.refreshToken);
  await me(rotated);
  await refresh(first, 401);
  await me(rotated, 401);
  await me(other);
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
    async function fixtureCommand(command) {
      if (command === 'reset-limits') {
        await db.collection('mobileloginattempts').deleteMany({});
        return {};
      }
      assert(['revoke-a', 'expire-a'].includes(command), 'Unknown fixture command');
      const result = await db.collection('mobilesessions').updateMany(
        { user: users[0]._id, revokedAt: null, expiresAt: { $gt: new Date() } },
        {
          $set: command === 'revoke-a' ? { revokedAt: new Date() } : { expiresAt: new Date(0) },
        }
      );
      return { affectedSessions: result.modifiedCount };
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
      if (!['revoke-a', 'expire-a', 'reset-limits'].includes(command))
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
    console.log(`Disposable accounts: mobile-a, mobile-b, mobile-empty\nPassword: ${password}`);
    console.log(
      `Shared trip: ${shared._id}\nB-only trip: ${privateTrip._id}\nFixture date: ${date}\nStop with Ctrl+C to remove the database and server.`
    );
    await writeFile(
      join(artifacts, 'fixture.json'),
      JSON.stringify({
        apiUrl: `${origin}/api/v1`,
        password,
        sharedTrip: String(shared._id),
        privateTrip: String(privateTrip._id),
        date,
        controlUrl,
        controlToken,
      }),
      { mode: 0o600 }
    );
    console.log(`Local fixture details: ${join(artifacts, 'fixture.json')}`);
    console.log('Commands: revoke-a, expire-a, reset-limits, quit');
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    terminal.on('line', (line) => {
      const command = line.trim();
      if (command === 'quit') return onSignal();
      if (!['revoke-a', 'expire-a', 'reset-limits'].includes(command)) {
        console.log('Commands: revoke-a, expire-a, reset-limits, quit');
        return;
      }
      void enqueueCommand(command)
        .then(() => console.log(`DONE ${command}`))
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
  // Unique generated container name is the only cleanup target, including partial startup.
  await exec('docker', ['rm', '--force', container]).catch(() => {});
  await writeFile(join(artifacts, 'next.log'), appLog, { mode: 0o600 });
  console.log(`Local diagnostic log: ${join(artifacts, 'next.log')}`);
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
