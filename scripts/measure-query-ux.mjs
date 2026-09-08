#!/usr/bin/env node
// Local production-build laboratory. No production URL, credentials or database required.
import { chromium } from 'playwright';
import { createServer, request } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const args = Object.fromEntries(process.argv.slice(2).map((s) => s.replace(/^--/, '').split('=')));
const samples = Number(args.samples ?? 3);
const rows = Number(args.rows ?? 1000);
if (!Number.isInteger(samples) || samples < 1 || samples > 20) throw Error('samples: 1..20');
if (!Number.isInteger(rows) || rows < 21 || rows > 100000) throw Error('rows: 21..100000');
const output = resolve(args.output ?? 'coverage/query-ux');
await mkdir(output, { recursive: true });
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const manifest = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'));
const readActions = new Set(
  Object.entries(manifest.node)
    .filter(
      ([, value]) =>
        (value.exportedName === 'getCurrentUser' && value.filename === 'actions/auth.actions.ts') ||
        (value.exportedName === 'getUnreadNotificationCount' &&
          value.filename === 'actions/notification.actions.ts')
    )
    .map(([key]) => key)
);
if (readActions.size !== 2) throw Error('Cannot uniquely allowlist anonymous read actions');

const id = 'q3-fixture';
const trip = {
  id,
  name: 'Q3 Fixture',
  description: null,
  start_date: '2026-09-08',
  end_date: '2026-09-08',
  destination_location: null,
  hash_code: id,
  created_at: '2026-09-08',
  archived_at: null,
  budget: null,
  legacy_budget: null,
  currency_settings: null,
};
const shell = {
  ...trip,
  role: null,
  member_count: 1,
  expense_count: rows,
  today_spent: 0,
  total_spent: 0,
};
const itinerary = [
  {
    id: 'd1',
    trip_id: id,
    day_number: 1,
    title: 'Fixture day',
    content: '',
    location: null,
    activities: [],
    created_at: '2026-09-08',
    updated_at: '2026-09-08',
  },
];
const expenses = Array.from({ length: rows }, (_, i) => ({
  id: `e${i}`,
  trip_id: id,
  payer_id: 'u1',
  payer_name: 'Fixture User',
  amount: 10,
  original_amount: 10,
  currency: 'TWD',
  exchange_rate: 1,
  description: i === rows - 1 ? 'Unique Sushi' : `Coffee ${i}`,
  category: 'food',
  date: '2026-09-08',
  created_at: '2026-09-08',
  splits: [],
  attachments: [],
  itinerary_day_ids: [],
  tags: [],
}));
const fixtures = {
  '': { trip },
  shell: { shell },
  itinerary: { itinerary },
  expenses: { expenses },
  members: { members: [] },
  landing: { trip, shell, itinerary, checklists: null, settlement: null },
};

// Reserve an ephemeral port. The process binds only to loopback and gets a dummy DB URI.
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const nextPort = reservation.address().port;
await new Promise((done) => reservation.close(done));
const next = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(nextPort),
  ],
  {
    env: {
      ...process.env,
      MONGODB_URI: 'mongodb://127.0.0.1:1/q3-no-database?serverSelectionTimeoutMS=100',
      JWT_SECRET: 'q3-local-only-not-a-real-session-secret',
      EXPENSE_BACKGROUND_DELIVERY: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
let serverLog = '';
next.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
next.stderr.on('data', (chunk) => {
  serverLog += chunk;
});
let browser;
const rejected = [];
const proxy = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method;
  const action = req.headers['next-action'];
  const isReadAction =
    method === 'POST' && readActions.has(action) && url.pathname.startsWith(`/trips/${id}`);
  if (method !== 'GET' && !isReadAction) {
    rejected.push(`${method} ${url.pathname}`);
    res.writeHead(405).end();
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const prefix = `/api/public/trips/${id}/`;
    const key = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : null;
    if (key !== null && Object.hasOwn(fixtures, key)) {
      // Fixed API delay, independent of real MongoDB or network variability.
      await delay(80);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(fixtures[key]));
      return;
    }
    rejected.push(`${method} ${url.pathname}`);
    res.writeHead(404).end();
    return;
  }
  const headers = { ...req.headers, cookie: 'NEXT_LOCALE=en' };
  delete headers.authorization;
  const upstream = request(
    { hostname: '127.0.0.1', port: nextPort, path: req.url, method, headers },
    (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    }
  );
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
});

const results = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (next.exitCode !== null) throw Error('Local Next process exited');
    try {
      ready = (await fetch(`http://127.0.0.1:${nextPort}/offline.html`)).ok;
    } catch {}
    if (ready) break;
    await delay(100);
  }
  if (!ready) throw Error('Local Next startup timed out');
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  browser = await chromium.launch(args.channel ? { channel: args.channel } : {});
  const profiles = [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, cpu: 1, sw: false },
    { name: 'mobile', viewport: { width: 390, height: 844 }, cpu: 4, sw: false },
    { name: 'pwa-worker', viewport: { width: 390, height: 844 }, cpu: 4, sw: true },
  ];
  for (const profile of profiles) {
    for (const route of ['itinerary', 'expenses']) {
      for (let sample = 1; sample <= samples; sample++) {
        const context = await browser.newContext({
          viewport: profile.viewport,
          locale: 'en-US',
          timezoneId: 'Asia/Taipei',
          serviceWorkers: profile.sw ? 'allow' : 'block',
          isMobile: profile.name !== 'desktop',
          hasTouch: profile.name !== 'desktop',
          deviceScaleFactor: profile.name === 'desktop' ? 1 : 3,
        });
        await context.tracing.start({ screenshots: true, snapshots: true });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Tracing.start', {
          categories: 'devtools.timeline,blink.user_timing,loading',
          transferMode: 'ReturnAsStream',
        });
        // Do not use Playwright routing: routing disables HTTP cache and corrupts warm comparisons.
        await cdp.send('Network.setBlockedURLs', { urls: ['https://*'] });
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
        await context.addInitScript((workerEnabled) => {
          if (!workerEnabled) delete Navigator.prototype.serviceWorker;
          window.__q3 = { lcp: null, longTasks: [], events: [], inputs: [] };
          for (const type of ['largest-contentful-paint', 'longtask', 'event']) {
            if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                if (type === 'largest-contentful-paint') window.__q3.lcp = entry.startTime;
                if (type === 'longtask') window.__q3.longTasks.push(entry.duration);
                if (type === 'event' && entry.interactionId)
                  window.__q3.events.push(entry.duration);
              }
            }).observe({
              type,
              buffered: true,
              ...(type === 'event' ? { durationThreshold: 16 } : {}),
            });
          }
          document.addEventListener('input', (event) => {
            if (event.target.id !== 'expense-search') return;
            const start = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => window.__q3.inputs.push(performance.now() - start))
            );
          });
        }, profile.sw);
        const url = `${origin}/trips/${id}${route === 'expenses' ? '/expenses' : ''}`;
        for (const cache of ['cold', 'warm']) {
          const requests = [];
          const record = (req) => {
            const u = new URL(req.url());
            if (u.origin === origin && (u.pathname.startsWith('/api/') || req.method() === 'POST'))
              requests.push({ method: req.method(), path: u.pathname });
          };
          page.on('request', record);
          await page.goto(url, { waitUntil: 'load' });
          if (route === 'expenses') await page.locator('#expense-search').waitFor();
          else await page.getByText('Fixture day', { exact: true }).waitFor();
          const readyMs = await page.evaluate(() => performance.now());
          const requestsBeforeSearch = requests.length;
          if (route === 'expenses') {
            const input = page.locator('#expense-search');
            await input.pressSequentially('Unique Sushi', { delay: 30 });
            await page.getByText('Unique Sushi', { exact: true }).waitFor();
            await input.fill('');
            await page.getByText('Coffee 0', { exact: true }).waitFor();
          }
          // Persistence throttle is 1s. Keep the settle window identical across samples.
          await page.waitForTimeout(1300);
          if (profile.sw) {
            await page.waitForFunction(() => !!navigator.serviceWorker.controller);
          }
          const metric = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const resources = performance.getEntriesByType('resource');
            const scripts = resources.filter((r) => r.initiatorType === 'script');
            return {
              ...window.__q3,
              ttfbMs: nav.responseStart,
              domContentLoadedMs: nav.domContentLoadedEventEnd,
              scriptRequests: scripts.length,
              scriptTransferBytes: scripts.reduce((sum, r) => sum + r.transferSize, 0),
              resourceTransferBytes: resources.reduce((sum, r) => sum + r.transferSize, 0),
              workerControlled: !!navigator.serviceWorker?.controller,
              standalone: matchMedia('(display-mode: standalone)').matches,
            };
          });
          page.off('request', record);
          const searchRequests = requests.slice(requestsBeforeSearch);
          if (route === 'itinerary' && requests.some((req) => req.path.endsWith('/expenses')))
            throw Error('Landing fetched expenses');
          const item = {
            errors: [...errors],
            searchRequests,
            profile: profile.name,
            route,
            sample,
            cache,
            readyMs,
            requests,
            ...metric,
          };
          results.push(item);
          process.stdout.write(
            JSON.stringify({
              profile: item.profile,
              route,
              sample,
              cache,
              readyMs: Math.round(readyMs),
              apiRequests: requests.length,
              worker: metric.workerControlled,
            }) + '\n'
          );
        }
        const complete = new Promise((done) => cdp.once('Tracing.tracingComplete', done));
        await cdp.send('Tracing.end');
        const { stream } = await complete;
        let timeline = '';
        while (true) {
          const chunk = await cdp.send('IO.read', { handle: stream });
          timeline += chunk.base64Encoded
            ? Buffer.from(chunk.data, 'base64').toString()
            : chunk.data;
          if (chunk.eof) break;
        }
        await cdp.send('IO.close', { handle: stream });
        await writeFile(
          resolve(output, `${profile.name}-${route}-${sample}.performance.json`),
          timeline
        );
        await context.tracing.stop({
          path: resolve(output, `${profile.name}-${route}-${sample}.zip`),
        });
        await context.close();
      }
    }
  }
  if (rejected.length)
    throw Error(`Unexpected requests blocked: ${[...new Set(rejected)].join(', ')}`);
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        label: args.label ?? 'local-build',
        buildId,
        browser: browser.version(),
        samples,
        rows,
        apiDelayMs: 80,
        network: 'loopback; no network throttling',
        cpu: 'desktop 1x; mobile / worker 4x',
        fixtureExpenseBytes: Buffer.byteLength(JSON.stringify(fixtures.expenses)),
        notes:
          'Synthetic public guest only. Warm reload retains HTTP/IDB/SW cache. Worker mode is not installed standalone PWA. Event durations are not field INP.',
        results,
      },
      null,
      2
    )
  );
  if (results.some((item) => item.errors.length))
    throw Error('Browser errors captured in results.json; this run is not a passing acceptance.');
} finally {
  await browser?.close();
  proxy.closeAllConnections();
  await new Promise((done) => proxy.close(done));
  next.kill('SIGTERM');
  await writeFile(resolve(output, 'server.log'), serverLog);
}
