/** Run local Expo Go acceptance against the disposable backend fixture. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startNetworkProxy } from './network-proxy.mjs';
import { createAuthTrace, verifyNaturalRefresh } from './auth-trace.mjs';
import { configureNativeLocale } from './native-locale.mjs';
// Node 24 can load this pure TypeScript table without changing the Expo package module type.
const { messages } = createRequire(import.meta.url)('../src/i18n/messages.ts');

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    device: { type: 'string' },
    fixture: { type: 'string' },
    'metro-port': { type: 'string' },
    'network-port': { type: 'string' },
    locale: { type: 'string', default: 'en' },
    locales: { type: 'string', default: 'en,zh,zh-CN,jp' },
    suite: { type: 'string', default: 'auth-trips' },
  },
});
assert(['ios', 'android'].includes(values.platform), 'Use --platform ios|android');
assert(values.device, 'Select a simulator with --device <UUID or emulator serial>');
assert(values.fixture, 'Use --fixture <path printed by dev:mobile-api>');
assert(
  [
    'auth-trips',
    'sessions',
    'lifecycle',
    'network',
    'appearance',
    'expiry',
    'locales',
    'keyboard',
    'ledger',
  ].includes(values.suite),
  'Use --suite auth-trips|sessions|lifecycle|network|appearance|expiry|locales|keyboard|ledger'
);
const needsControl = values.suite !== 'auth-trips';
if (values.suite === 'keyboard') assert.equal(values.platform, 'ios', 'Keyboard suite targets iOS');
assert(Object.hasOwn(messages, values.locale), 'Use --locale en|zh|zh-CN|jp (must match device)');
const port = Number(values['metro-port']);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'Use --metro-port <local Metro port>');
const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
assert.equal(fixture.date, today, 'Fixture is from another day; restart dev:mobile-api and Metro');
const api = new URL(fixture.apiUrl);
assert(
  api.protocol === 'http:' && api.hostname === '127.0.0.1' && api.pathname === '/api/v1',
  'Only the disposable loopback backend is supported'
);
assert(
  typeof fixture.password === 'string' && fixture.password.length > 0,
  'Missing fixture password'
);
for (const key of ['sharedTrip', 'privateTrip'])
  assert(/^[a-f0-9]{24}$/.test(fixture[key]), `Invalid ${key}`);
const ledgerKeys = ['ledgerTrip', 'emptyLedgerTrip', 'settledLedgerTrip'];
if (['ledger', 'locales'].includes(values.suite))
  for (const key of ledgerKeys)
    assert(/^[a-f0-9]{24}$/.test(fixture[key]), `Invalid ${key}; restart dev:mobile-api`);
const response = await fetch(`${api}/me`, { signal: AbortSignal.timeout(5000) });
assert.equal(response.status, 401, 'Start dev:mobile-api before native acceptance');
if (needsControl) {
  assert(fixture.controlUrl, 'Restart dev:mobile-api to enable session acceptance');
  const control = new URL(fixture.controlUrl);
  assert(
    control.protocol === 'http:' &&
      control.hostname === '127.0.0.1' &&
      control.pathname === '/' &&
      /^[a-f0-9]{64}$/.test(fixture.controlToken),
    'Invalid local fixture control channel'
  );
  const health = await fetch(`${control.origin}/health`, {
    headers: { Authorization: `Bearer ${fixture.controlToken}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(health.status, 200, 'Fixture control is unavailable');
  assert.equal(
    (await health.json()).apiUrl,
    fixture.apiUrl,
    'Fixture control belongs to another API'
  );
}
const artifacts = await mkdtemp(join(tmpdir(), 'travel-budget-native-'));
function localizedEnv(locale) {
  const t = messages[locale];
  return {
    MAESTRO_SELECT_LATIN_KEYBOARD: String(locale !== 'en'),
    MAESTRO_TITLE: t.title,
    MAESTRO_SUBTITLE: t.subtitle,
    MAESTRO_REQUIRED: t.required,
    MAESTRO_INVALID: t.invalidCredentials,
    MAESTRO_EMPTY: t.noTrips,
    MAESTRO_NOT_FOUND: t.notFound,
    MAESTRO_RECEIVABLE: t.receivable,
    MAESTRO_PAYABLE: t.payable,
    MAESTRO_SESSION_EXPIRED: t.sessionExpired,
    MAESTRO_STALE_DATA: t.staleData,
    MAESTRO_RETRY: t.retry,
    MAESTRO_NETWORK_ERROR: t.networkError,
    MAESTRO_RESTORE_ERROR: t.restoreError,
    MAESTRO_EXPENSES: t.expenses,
    MAESTRO_CATEGORY_SHOPPING: t.categoryShopping,
    MAESTRO_SETTLEMENT_OUTSTANDING: t.settlementOutstanding,
    MAESTRO_SETTLEMENT_SETTLED: t.settlementSettled,
    MAESTRO_SETTLEMENT_EMPTY: t.settlementEmpty,
    MAESTRO_UNPAID: t.unpaid,
  };
}
const env = {
  ...process.env,
  MAESTRO_CLI_NO_ANALYTICS: '1',
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  MAESTRO_APP_ID: values.platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent',
  MAESTRO_EXPO_URL: `exp://127.0.0.1:${port}`,
  MAESTRO_PASSWORD: fixture.password,
  MAESTRO_SHARED_TRIP: fixture.sharedTrip,
  MAESTRO_PRIVATE_TRIP: fixture.privateTrip,
  MAESTRO_REQUIRE_KEYBOARD: String(values.suite === 'keyboard'),
  ...(['ledger', 'locales'].includes(values.suite)
    ? {
        MAESTRO_LEDGER_TRIP: fixture.ledgerTrip,
        MAESTRO_EMPTY_LEDGER_TRIP: fixture.emptyLedgerTrip,
        MAESTRO_SETTLED_LEDGER_TRIP: fixture.settledLedgerTrip,
      }
    : {}),
  ...localizedEnv(values.locale),
  ...(needsControl
    ? { MAESTRO_CONTROL_URL: fixture.controlUrl, MAESTRO_CONTROL_TOKEN: fixture.controlToken }
    : {}),
};
console.log(`Running ${values.platform} native acceptance; local artifacts: ${artifacts}`);
// Maestro may echo inputText values; keep fixture credentials out of terminal output.
const redact = (line) => {
  for (const secret of [fixture.password, fixture.controlToken, proxy?.token].filter(Boolean))
    line = line.replaceAll(secret, '[fixture credential]');
  return line;
};
let child;
let proxy;
const authTrace = createAuthTrace();
const interrupted = new AbortController();
const stop = () => {
  interrupted.abort();
  child?.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
async function runFlow(flow, artifactName = flow) {
  interrupted.signal.throwIfAborted();
  child = spawn(
    'maestro',
    [
      '--device',
      values.device,
      'test',
      '--no-ansi',
      '--test-output-dir',
      join(artifacts, artifactName),
      `maestro/${flow}.yaml`,
    ],
    { env, stdio: ['inherit', 'pipe', 'pipe'] }
  );
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    let pending = '';
    stream.on('data', (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) console.log(redact(line));
    });
    stream.on('end', () => {
      if (pending) console.log(redact(pending));
    });
  }
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      child = undefined;
      if (code === 0) resolve();
      else reject(new Error(`Maestro ${flow} failed (${code ?? 'interrupted'})`));
    });
  });
}
try {
  if (['network', 'expiry'].includes(values.suite)) {
    const networkPort = Number(values['network-port']);
    assert(
      Number.isInteger(networkPort) && networkPort > 0 && networkPort < 65536,
      'Use --network-port <unused local port>; Metro API must use this proxy port'
    );
    proxy = await startNetworkProxy(fixture.apiUrl, networkPort, authTrace.observe);
    env.MAESTRO_NETWORK_URL = proxy.url;
    env.MAESTRO_NETWORK_TOKEN = proxy.token;
    console.log(`Network proxy: ${proxy.url}/api/v1 (Metro must use this API port)`);
  }
  if (values.suite === 'locales') {
    for (const locale of values.locales.split(',')) {
      assert(Object.hasOwn(messages, locale), 'Use --locales en,zh,zh-CN,jp (or a subset)');
      interrupted.signal.throwIfAborted();
      console.log(`Verifying native locale: ${locale}`);
      const restoreLocale = configureNativeLocale(values.platform, values.device, locale);
      try {
        Object.assign(env, localizedEnv(locale));
        const reset = await fetch(`${fixture.controlUrl}/reset-limits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${fixture.controlToken}` },
          signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(5000)]),
        });
        assert.equal(reset.status, 200, 'Unable to reset fixture login limits');
        await runFlow('auth-trips', `locale-${locale}`);
        await runFlow('ledger', `locale-${locale}-ledger`);
      } finally {
        restoreLocale();
      }
    }
  } else if (values.suite === 'expiry') {
    await runFlow('expiry-start');
    const original = authTrace.events.findLast((e) => e.status === 200 && e.expiresAt);
    assert(original, 'App did not authenticate through the acceptance proxy');
    assert.equal(original.expiresAt - original.issuedAt, 900_000, 'Expected a 15-minute JWT');
    while (Date.now() < original.expiresAt + 1500) {
      const remaining = original.expiresAt + 1500 - Date.now();
      console.log(
        `Waiting for natural JWT expiry: ${Math.ceil(remaining / 1000)} seconds remaining`
      );
      await delay(Math.min(30_000, remaining), undefined, { signal: interrupted.signal });
    }
    await runFlow('expiry-refresh');
    verifyNaturalRefresh(authTrace.events, original);
    console.log('Verified expired JWT → backend 401 → one refresh → successful replay.');
    const refreshCount = authTrace.events.filter((e) => e.path === '/api/v1/auth/refresh').length;
    await runFlow('expiry-restore');
    assert.equal(
      authTrace.events.filter((e) => e.path === '/api/v1/auth/refresh' && e.status === 200).length,
      refreshCount + 1,
      'Cold start must restore the rotated SecureStore credential'
    );
  } else if (values.suite === 'lifecycle') {
    await runFlow('lifecycle-background');
    // The production cache is fresh for 30 seconds. Wait on the host while the
    // actual app stays backgrounded; do not shorten product timers for acceptance.
    console.log('App is backgrounded; waiting 35 seconds for cached data to become stale.');
    await delay(35_000, undefined, { signal: interrupted.signal });
    const revoked = await fetch(`${fixture.controlUrl}/revoke-a`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fixture.controlToken}` },
      signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(5000)]),
    });
    assert.equal(revoked.status, 200, 'Unable to revoke the background session');
    assert((await revoked.json()).affectedSessions > 0, 'No background session was revoked');
    if (values.platform === 'android') {
      // Expo Go's launcher activity is a separate task from the running project.
      // Open Recents so Maestro can resume the existing project card instead.
      const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
      execFileSync(
        sdk ? join(sdk, 'platform-tools', 'adb') : 'adb',
        ['-s', values.device, 'shell', 'input', 'keyevent', 'KEYCODE_APP_SWITCH'],
        { timeout: 5000 }
      );
    }
    await runFlow('lifecycle-resume');
  } else {
    await runFlow(values.suite === 'keyboard' ? 'appearance' : values.suite);
    if (proxy) {
      assert(proxy.counts.forwarded > 0, 'App did not connect through the network proxy');
      assert(proxy.counts.disconnect >= 2, 'Missing logout/restore disconnection requests');
      assert(proxy.counts.timeout > 0, 'Missing summary timeout request');
    }
  }
} catch (error) {
  console.error(redact(error.message));
  process.exitCode = 1;
} finally {
  try {
    if (values.suite === 'expiry') {
      await writeFile(
        join(artifacts, 'auth-trace.json'),
        JSON.stringify(authTrace.events, null, 2),
        {
          mode: 0o600,
        }
      );
    }
  } finally {
    await proxy?.close();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
