/** Production-browser regression. Creates only disposable local Docker/DB/browser state. */
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import mongoose from 'mongoose';
import { SignJWT } from 'jose';
import { verifyWebLedgerBrowser } from './verify-web-ledger-browser.mjs';
import { up as migrateRequests } from '../migrations/20260912160000-expense-create-requests.js';

const exec = promisify(execFile);
const runId = randomUUID().replaceAll('-', '');
const container = `tb-offline-${runId}`;
const dbName = `tb_offline_${runId}`;
const artifacts = await mkdtemp(join(tmpdir(), 'travel-budget-offline-'));
const results = [];
let dockerCreated = false;
let mongo;
let nativeMongo;
let app;
let browser;
let page;
let appLog = '';
async function eventually(check, message, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      if (!/Execution context was destroyed/.test(error.message)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
async function reloadPage(tab) {
  try {
    await tab.reload();
  } catch (error) {
    if (!error.message.includes('net::ERR_ABORTED')) throw error;
    // A final Server Action refresh can supersede navigation; require a completed reload.
    await tab.goto(tab.url());
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function pass(name) {
  results.push(name);
  console.log(`PASS ${name}`);
}
try {
  let uri;
  if (process.env.MONGOD_BINARY) {
    console.log('Starting disposable native MongoDB replica set');
    const mongoPort = await freePort();
    const dbPath = join(artifacts, 'mongo-data');
    await mkdir(dbPath);
    nativeMongo = spawn(
      process.env.MONGOD_BINARY,
      [
        '--dbpath',
        dbPath,
        '--port',
        String(mongoPort),
        '--bind_ip',
        '127.0.0.1',
        '--replSet',
        'offlineverify',
        '--logpath',
        join(artifacts, 'mongo.log'),
      ],
      { stdio: 'ignore' }
    );
    uri = `mongodb://127.0.0.1:${mongoPort}/${dbName}?directConnection=true`;
    await eventually(async () => {
      const candidate = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 500 });
      try {
        mongo = await candidate.connect();
        return true;
      } catch {
        await candidate.close();
        return false;
      }
    }, 'Native MongoDB did not start');
    await mongo.db('admin').command({
      replSetInitiate: {
        _id: 'offlineverify',
        members: [{ _id: 0, host: `127.0.0.1:${mongoPort}` }],
      },
    });
  } else {
    console.log('Starting disposable MongoDB replica set');
    await exec('docker', [
      'run',
      '--detach',
      '--name',
      container,
      '--env',
      'GLIBC_TUNABLES=glibc.pthread.rseq=1',
      '--publish',
      '127.0.0.1::27017',
      'mongo:8.0',
      '--replSet',
      'offlineverify',
      '--bind_ip_all',
    ]);
    dockerCreated = true;
    await eventually(async () => {
      try {
        await exec('docker', [
          'exec',
          container,
          'mongosh',
          '--quiet',
          '--eval',
          'db.adminCommand({ping:1})',
        ]);
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
      'rs.initiate({_id:"offlineverify",members:[{_id:0,host:"localhost:27017"}]})',
    ]);
    const mapping = (await exec('docker', ['port', container, '27017/tcp'])).stdout.trim();
    uri = `mongodb://${mapping}/${dbName}?directConnection=true`;
    mongo = await new mongoose.mongo.MongoClient(uri).connect();
  }
  const db = mongo.db(dbName);
  await eventually(
    async () => (await db.admin().command({ hello: 1 })).isWritablePrimary,
    'MongoDB did not elect a primary'
  );
  const userId = new mongoose.Types.ObjectId();
  const tripId = new mongoose.Types.ObjectId();
  const now = new Date();
  await db.collection('users').insertOne({
    _id: userId,
    username: 'offline-fixture',
    displayName: 'Offline Tester',
    email: 'offline@example.invalid',
    password: 'not-a-login-password',
    notifyByEmail: false,
    isVirtual: false,
    createdAt: now,
    locale: 'en',
  });
  const membership = { user: userId, role: 'admin', joinedAt: now, archivedAt: null, budget: null };
  await db.collection('trips').insertOne({
    _id: tripId,
    name: 'Offline acceptance fixture',
    hashCode: runId.slice(0, 12),
    description: '',
    members: [membership],
    startDate: now,
    endDate: now,
    createdAt: now,
    currencySettings: null,
  });
  await migrateRequests(db);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const jwtSecret = randomBytes(48).toString('hex');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    MONGODB_URI: uri,
    JWT_SECRET: jwtSecret,
    APP_URL: origin,
    ENABLE_NON_TWD_LEDGER: 'false',
    EXPENSE_BACKGROUND_DELIVERY: 'off',
    NEXT_TELEMETRY_DISABLED: '1',
    RESEND_API_KEY: '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    VAPID_PRIVATE_KEY: '',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: '',
    AI_GATEWAY_API_KEY: '',
    OPENAI_API_KEY: '',
    CRON_SECRET: '',
  };
  // Only the owned child server uses deterministic rates; no provider traffic or production switch.
  const rateFixture = join(artifacts, 'rate-fixture.cjs');
  await writeFile(
    rateFixture,
    `const original = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url ?? String(input);
      if (url === 'https://api.frankfurter.dev/v2/rates?base=TWD') return Promise.resolve(new Response(JSON.stringify([
        {base:'TWD',quote:'USD',rate:0.03125,date:'2026-10-08'},
        {base:'TWD',quote:'JPY',rate:4.7,date:'2026-10-08'},
        {base:'TWD',quote:'EUR',rate:0.028,date:'2026-10-08'}
      ]), {status:200,headers:{'Content-Type':'application/json'}}));
      return original(input, init);
    };`
  );
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ''} --require ${rateFixture}`;
  if (!process.argv.includes('--skip-build')) {
    console.log('Building production application with Service Worker');
    try {
      const build = await exec('pnpm', ['build'], { env, maxBuffer: 10 * 1024 * 1024 });
      await writeFile(join(artifacts, 'build.log'), build.stdout + build.stderr);
    } catch (error) {
      await writeFile(join(artifacts, 'build.log'), (error.stdout ?? '') + (error.stderr ?? ''));
      throw new Error(`Build failed; see ${join(artifacts, 'build.log')}`);
    }
  }
  app = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  app.stdout.on('data', (data) => {
    appLog += data;
  });
  app.stderr.on('data', (data) => {
    appLog += data;
  });
  await eventually(
    async () => {
      try {
        return (await fetch(`${origin}/login`)).ok;
      } catch {
        return false;
      }
    },
    'Application did not start',
    60_000
  );
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'allow',
  });
  const networkSessions = new Map();
  async function setConnectivityOffline(offline) {
    await context.setOffline(offline);
    // Chromium can reset navigator.onLine when same-origin targets close/navigate.
    // Keep the browser's network-state override aligned with actual blocked traffic.
    for (const tab of context.pages()) {
      if (!networkSessions.has(tab)) networkSessions.set(tab, await context.newCDPSession(tab));
      await networkSessions.get(tab).send('Network.overrideNetworkState', {
        offline,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
  }
  const token = await new SignJWT({ userId: String(userId), username: 'offline-fixture' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(jwtSecret));
  await context.addCookies([
    { name: 'session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' },
    { name: 'NEXT_LOCALE', value: 'en', url: origin },
  ]);
  const pageErrors = [];
  context.on('page', (tab) => tab.on('pageerror', (error) => pageErrors.push(error.message)));
  page = await context.newPage();
  const expensesUrl = `${origin}/trips/${tripId}/expenses`;
  const outboxKey = `travel-budget-expense-outbox:${encodeURIComponent(`user:${userId}`)}`;
  const cacheKey = `travel-budget-rq-cache:${encodeURIComponent(`user:${userId}`)}`;
  async function idbRead(key) {
    return page.evaluate(
      (key) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('keyval-store');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('keyval', 'readonly');
            const read = transaction.objectStore('keyval').get(key);
            read.onsuccess = () => resolve(read.result);
            read.onerror = () => reject(read.error);
            transaction.oncomplete = () => db.close();
          };
        }),
      key
    );
  }
  const entries = async () => Object.values((await idbRead(outboxKey)) ?? {});
  const count = (description) =>
    db.collection('expenses').countDocuments({ trip: tripId, description });
  async function openForm() {
    await page
      .getByRole('button', { name: /^(Add Expense|Add your first expense)$/ })
      .first()
      .click();
    await page.locator('#expense-description').waitFor();
  }
  async function fill(description, amount) {
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill(String(amount));
  }
  async function submit() {
    await page.locator('button[form="expense-form"]').click();
    await page.locator('#expense-description').waitFor({ state: 'hidden' });
  }
  await page.goto(expensesUrl);
  await page
    .getByRole('button', { name: /^(Add Expense|Add your first expense)$/ })
    .first()
    .waitFor();
  await eventually(
    () => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active),
    'Service Worker did not activate'
  );
  await eventually(
    () => page.evaluate(() => !!navigator.serviceWorker.controller),
    'No Service Worker controller'
  );
  // Warm the document after activation; the first navigation precedes SW control.
  await reloadPage(page);
  await openForm();
  await eventually(async () => {
    const cached = await idbRead(cacheKey);
    return (
      !!cached &&
      JSON.parse(cached).clientState.queries.some((q) => q.queryKey[0] === 'currentUser')
    );
  }, 'Form prerequisites were not cached');
  await fill('offline-reload', 13);
  await setConnectivityOffline(true);
  await submit();
  assert.equal((await entries()).filter((entry) => entry.status === 'pending').length, 1);
  assert.equal(await count('offline-reload'), 0);
  // The mutation journal must survive even before the throttled query snapshot flush.
  await reloadPage(page);
  await page.getByText('offline-reload', { exact: true }).first().waitFor();
  await reloadPage(page);
  await page.getByText('offline-reload', { exact: true }).first().waitFor();
  assert.equal((await entries()).filter((entry) => entry.status === 'pending').length, 1);
  assert.equal(await count('offline-reload'), 0);
  assert.equal(
    await page.getByText('Unable to load data. Please try again.', { exact: true }).count(),
    0
  );
  await setConnectivityOffline(false);
  await eventually(
    async () => (await count('offline-reload')) === 1,
    'Offline request did not replay'
  );
  await eventually(
    async () => (await entries()).every((entry) => entry.status === 'done'),
    'Journal did not acknowledge success'
  );
  pass('real IndexedDB + SW: immediate and repeated offline reload, then exactly one write');

  // Receipt lookup and write carry the same body. Target the compiled writer explicitly.
  const actions = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'));
  const createActionIds = new Set(
    Object.entries(actions.node)
      .filter(([, action]) =>
        ['createExpense', 'createLedgerExpense'].includes(action.exportedName)
      )
      .map(([id]) => id)
  );
  assert.ok(createActionIds.size > 0, 'The production manifest must identify expense writers');
  // Commit the actual server action, then drop its response to the browser.
  let dropped = false;
  await page.route('**/*', async (route) => {
    if (
      !dropped &&
      route.request().method() === 'POST' &&
      createActionIds.has(route.request().headers()['next-action']) &&
      (route.request().postData() ?? '').includes('lost-response')
    ) {
      dropped = true;
      await route.fetch();
      await setConnectivityOffline(true);
      await route.abort('internetdisconnected');
    } else await route.continue();
  });
  await openForm();
  await fill('lost-response', 17);
  await submit();
  await eventually(
    async () => dropped && (await count('lost-response')) === 1,
    'Did not commit the dropped-response fixture'
  );
  await page.unrouteAll({ behavior: 'wait' });
  await reloadPage(page);
  await page.getByText('lost-response', { exact: true }).first().waitFor();
  await setConnectivityOffline(false);
  await eventually(
    async () => (await entries()).every((entry) => entry.status === 'done'),
    'Lost-response request did not finish replay'
  );
  assert.equal(await count('lost-response'), 1);
  pass('real server commit with a lost response: reload/retry does not duplicate expense');

  await openForm();
  await fill('rejected-draft', 19);
  await setConnectivityOffline(true);
  await submit();
  await db.collection('trips').updateOne({ _id: tripId }, { $set: { members: [] } });
  await setConnectivityOffline(false);
  await eventually(
    async () => (await entries()).some((entry) => entry.status === 'failed'),
    'Rejected input was not retained'
  );
  // Reproduce a tab closing after the terminal is durable but before lock cleanup.
  const failedId = (await entries()).find((entry) => entry.status === 'failed').vars.input
    .client_request_id;
  await page.evaluate(
    ({ key, trip, id }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('keyval-store');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('keyval', 'readwrite');
          transaction.objectStore('keyval').put({ [trip]: id }, key);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    {
      key: `travel-budget-write-coordination:${encodeURIComponent(`user:${userId}`)}`,
      trip: String(tripId),
      id: failedId,
    }
  );
  await reloadPage(page);
  await page.getByRole('button', { name: 'Review drafts', exact: true }).click();
  await page.getByText(/rejected-draft ·/).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft', exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs(join(artifacts, 'synthetic-draft.json'));
  await db.collection('trips').updateOne({ _id: tripId }, { $set: { members: [membership] } });
  await page.goto(expensesUrl);
  await page.getByRole('button', { name: 'Review drafts', exact: true }).click();
  await page.getByRole('button', { name: 'Edit and resubmit', exact: true }).click();
  await page.locator('#expense-description').waitFor();
  assert.equal(await page.locator('#expense-description').inputValue(), 'rejected-draft');
  await fill('corrected-draft', 23);
  await submit();
  await eventually(
    async () => (await count('corrected-draft')) === 1,
    'Corrected draft was not saved'
  );
  assert.equal(await count('rejected-draft'), 0);
  pass(
    'revoked membership: failed draft survives reload, exports, and can be corrected after access returns'
  );

  await openForm();
  await fill('storage-failure', 29);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.restoreOutboxWrites = () => {
      IDBObjectStore.prototype.put = put;
    };
    IDBObjectStore.prototype.put = function (value, key) {
      if (String(key).startsWith('travel-budget-expense-outbox:'))
        throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      return put.call(this, value, key);
    };
  });
  await page.locator('button[form="expense-form"]').click();
  await page.getByText('Synthetic storage full', { exact: true }).waitFor();
  assert.equal(await page.locator('#expense-description').inputValue(), 'storage-failure');
  assert.equal(await count('storage-failure'), 0);
  assert(!(await entries()).some((entry) => entry.vars.input.description === 'storage-failure'));
  await page.evaluate(() => window.restoreOutboxWrites());
  await submit();
  await eventually(
    async () => (await count('storage-failure')) === 1,
    'Retry after storage recovery failed'
  );
  pass(
    'IndexedDB write rejection preserves the form and sends nothing; retry after recovery succeeds'
  );

  const firstPage = page;
  const secondPage = await context.newPage();
  await secondPage.goto(expensesUrl);
  page = firstPage;
  await openForm();
  await fill('tab-one', 31);
  page = secondPage;
  await openForm();
  await fill('tab-two', 37);
  await setConnectivityOffline(true);
  await Promise.all([
    firstPage.locator('button[form="expense-form"]').click(),
    secondPage.locator('button[form="expense-form"]').click(),
  ]);
  await Promise.all([
    firstPage.locator('#expense-description').waitFor({ state: 'hidden' }),
    secondPage.locator('#expense-description').waitFor({ state: 'hidden' }),
  ]);
  assert.equal((await entries()).filter((entry) => entry.status === 'pending').length, 2);
  await Promise.all([firstPage.reload(), secondPage.reload()]);
  await firstPage.getByText('tab-one', { exact: true }).first().waitFor();
  await secondPage.getByText('tab-two', { exact: true }).first().waitFor();
  await eventually(
    async () => (await firstPage.locator('body').innerText()).includes('My share NT$150'),
    'Offline multi-tab shell did not include both pending expenses'
  );
  await setConnectivityOffline(false);
  await eventually(
    async () => (await count('tab-one')) === 1 && (await count('tab-two')) === 1,
    'Concurrent tab replay failed'
  );
  await eventually(
    async () => (await entries()).every((entry) => entry.status === 'done'),
    'Concurrent tab queue did not settle'
  );
  assert.equal(await count('tab-one'), 1);
  assert.equal(await count('tab-two'), 1);
  pass(
    'two tabs commit independent drafts atomically and replay shared work without duplicate rows'
  );
  await secondPage.close();
  page = firstPage;
  await reloadPage(page);
  await page.getByText('tab-two', { exact: true }).first().waitFor();

  // Reproduce the production timing gap: restore after one rejection, then reject
  // the remaining request before a server summary can repair the local projection.
  await openForm();
  await fill('staged-reject-one', 41);
  await setConnectivityOffline(true);
  await submit();
  await openForm();
  await fill('staged-reject-two', 43);
  await submit();
  await page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onsuccess = () => {
          const database = open.result;
          const tx = database.transaction('keyval', 'readwrite');
          const store = tx.objectStore('keyval');
          const read = store.get(key);
          read.onsuccess = () => {
            const journal = read.result;
            for (const entry of Object.values(journal))
              if (entry.vars.input.description.startsWith('staged-reject-'))
                entry.vars.input.original_amount *= -1;
            store.put(journal, key);
          };
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    outboxKey
  );
  await reloadPage(page);
  await page.getByText('staged-reject-two', { exact: true }).first().waitFor();
  let heldSecond = false;
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.method() === 'POST' && request.headers()['next-action']) {
      if ((request.postData() ?? '').includes('staged-reject-two')) {
        await eventually(
          async () =>
            (await entries()).some(
              (entry) =>
                entry.vars.input.description === 'staged-reject-one' && entry.status === 'failed'
            ),
          'First staged rejection did not arrive'
        );
        await setConnectivityOffline(true);
        heldSecond = true;
        await route.abort('internetdisconnected');
      } else if (!(request.postData() ?? '').includes('staged-reject-one')) {
        // Derived refetches must not hide a broken local rollback.
        await route.abort('internetdisconnected');
      } else await route.continue();
    } else await route.continue();
  });
  await setConnectivityOffline(false);
  await eventually(() => heldSecond, 'Second staged request was not held');
  await page.unrouteAll({ behavior: 'wait' });
  await reloadPage(page);
  await setConnectivityOffline(true);
  await eventually(
    async () => (await page.locator('body').innerText()).includes('My share NT$193'),
    'Partially rejected shell did not retain only the second amount'
  );
  // Wait for this recombined projection to be persisted, then reject its last request.
  await eventually(async () => {
    const saved = await idbRead(cacheKey);
    return (
      saved &&
      JSON.parse(saved).clientState.queries.some(
        (query) => query.queryKey[2] === 'shell' && query.state.data.total_spent === 193
      )
    );
  }, 'Partially rejected shell was not persisted');
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] &&
      !(request.postData() ?? '').includes('staged-reject-two')
    )
      await route.abort('internetdisconnected');
    else await route.continue();
  });
  await setConnectivityOffline(false);
  await eventually(
    async () =>
      (await entries()).filter(
        (entry) =>
          entry.vars.input.description.startsWith('staged-reject-') && entry.status === 'failed'
      ).length === 2,
    'Second staged rejection did not persist'
  );
  await setConnectivityOffline(true);
  await page.unrouteAll({ behavior: 'wait' });
  for (let reload = 0; reload < 2; reload++) {
    await reloadPage(page);
    await setConnectivityOffline(true);
    await page.getByRole('button', { name: 'Review drafts', exact: true }).waitFor();
    await eventually(
      async () => (await page.locator('body').innerText()).includes('My share NT$150'),
      'Failed contributions survived offline reload'
    );
    assert.equal(await page.getByText('staged-reject-two', { exact: true }).count(), 0);
    await eventually(async () => {
      const saved = await idbRead(cacheKey);
      return (
        saved &&
        JSON.parse(saved).clientState.queries.some(
          (query) => query.queryKey[2] === 'shell' && query.state.data.total_spent === 150
        )
      );
    }, 'Fully rejected summary was not persisted');
  }
  assert.equal(await count('staged-reject-one'), 0);
  assert.equal(await count('staged-reject-two'), 0);
  await page.screenshot({ path: join(artifacts, 'staged-rejections.png'), fullPage: true });
  pass(
    'staged permanent failures: recombined summary survives repeated offline reload without a server refetch'
  );
  await setConnectivityOffline(false);
  await reloadPage(page);
  await page.getByText('tab-two', { exact: true }).first().waitFor();

  await openForm();
  await fill('missing-read-cache', 41);
  await setConnectivityOffline(true);
  assert.equal(
    await page.evaluate(() => navigator.onLine),
    false,
    'Browser did not switch offline'
  );
  await submit();
  await page.evaluate(
    (key) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onsuccess = () => {
          const database = open.result;
          const tx = database.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').delete(key);
          tx.oncomplete = () => {
            database.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      }),
    cacheKey
  );
  await reloadPage(page);
  // Traffic stays blocked throughout navigation. Chrome can reset only its online
  // indicator; reapply the native override before asserting the offline-read UI.
  await setConnectivityOffline(true);
  assert.equal(
    await page.evaluate(() => navigator.onLine),
    false,
    'Browser did not stay offline across reload'
  );
  await page
    .getByText('You are offline and this data is not saved on this device.', { exact: false })
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Review drafts', exact: true }).click();
  await page.getByText(/missing-read-cache ·/).waitFor();
  assert.equal((await entries()).filter((entry) => entry.status === 'pending').length, 1);
  await setConnectivityOffline(false);
  await eventually(
    async () => (await count('missing-read-cache')) === 1,
    'Independent journal was lost with read cache'
  );
  await reloadPage(page);
  await page.getByText('missing-read-cache', { exact: true }).first().waitFor();
  pass(
    'missing offline read cache shows a clear message while the independent journal remains recoverable and syncs'
  );

  await eventually(
    async () => (await page.locator('body').innerText()).includes('My share NT$191'),
    'Final shell summary did not reconcile to 191'
  );
  assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join('; ')}`);
  assert.equal(await db.collection('expenses').countDocuments({ trip: tripId }), 7);
  await page.screenshot({ path: join(artifacts, 'completed.png'), fullPage: true });
  await eventually(async () => {
    const saved = await idbRead(cacheKey);
    return (
      !!saved &&
      JSON.parse(saved).clientState.queries.some((query) => query.queryKey[0] === 'currentUser')
    );
  }, 'Offline form identity was not persisted');
  assert.equal(await db.collection('expensecreaterequests').countDocuments({ trip: tripId }), 7);

  await verifyWebLedgerBrowser({ db, page, origin, userId, idbRead, eventually, pass });
  assert.equal(pageErrors.length, 0, `Browser errors: ${pageErrors.join('; ')}`);

  await writeFile(
    join(artifacts, 'results.json'),
    JSON.stringify(
      { results, browser: browser.version(), serviceWorker: true, pageErrors, expenseCount: 7 },
      null,
      2
    )
  );
  console.log(`Browser acceptance passed. Synthetic artifacts: ${artifacts}`);
} catch (error) {
  if (page) {
    await writeFile(
      join(artifacts, 'browser-state.json'),
      JSON.stringify(
        await page
          .evaluate(() => ({
            online: navigator.onLine,
            href: location.href,
            sw: !!navigator.serviceWorker.controller,
          }))
          .catch(() => ({}))
      )
    );
    await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(
      join(artifacts, 'failure-journals.json'),
      JSON.stringify(
        await page
          .evaluate(
            () =>
              new Promise((resolve, reject) => {
                const open = indexedDB.open('keyval-store');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                  const database = open.result,
                    tx = database.transaction('keyval', 'readonly'),
                    store = tx.objectStore('keyval');
                  const keys = store.getAllKeys(),
                    values = store.getAll();
                  tx.oncomplete = () => {
                    database.close();
                    resolve(
                      Object.fromEntries(
                        keys.result
                          .map((key, i) => [String(key), values.result[i]])
                          .map(([key, value]) => [
                            key,
                            key.startsWith('travel-budget-rq-cache:')
                              ? JSON.parse(value)
                                  .clientState.queries.filter((q) => q.queryKey[2] === 'shell')
                                  .map((q) => ({ key: q.queryKey, data: q.state.data }))
                              : value,
                          ])
                      )
                    );
                  };
                  tx.onerror = () => reject(tx.error);
                };
              })
          )
          .catch(() => ({})),
        null,
        2
      )
    );
    await writeFile(
      join(artifacts, 'failure.txt'),
      await page
        .locator('body')
        .innerText()
        .catch(() => 'Page unavailable')
    );
  }
  console.error(error);
  console.error(`Artifacts: ${artifacts}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (app) app.kill('SIGTERM');
  await writeFile(join(artifacts, 'server.log'), appLog);
  await mongo?.close();
  if (dockerCreated) await exec('docker', ['rm', '-fv', container]);
  if (nativeMongo) {
    const stopped = new Promise((resolve) => nativeMongo.once('close', resolve));
    nativeMongo.kill('SIGTERM');
    await stopped;
    await rm(join(artifacts, 'mongo-data'), { recursive: true, force: true });
  }
}
