/** Run local Expo Go acceptance against the disposable backend fixture. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { startNetworkProxy } from './network-proxy.mjs';
import { createAuthTrace, isRefreshPath, verifyNaturalRefresh } from './auth-trace.mjs';
import {
  entryFlows,
  entryReceiptExpectations,
  verifyEntryTraffic,
  verifyEntryDatabase,
} from './entry-trace.mjs';
import { configureNativeLocale } from './native-locale.mjs';
import { configureNativeDisplay } from './native-display.mjs';
import { createNativeSqliteControl } from './native-sqlite.mjs';
import { startNativeSqlGate } from './native-sql-gate.mjs';
import { createNativeConnectivity } from './native-connectivity.mjs';
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
    flows: { type: 'string' },
    'locale-flows': { type: 'string' },
    'entry-api-version': { type: 'string', default: '2' },
    'flow-timeout': { type: 'string', default: '20' },
    appearance: { type: 'string' },
    'text-size': { type: 'string' },
    'native-sqlite': { type: 'boolean', default: false },
    'native-locale': { type: 'boolean', default: false },
    'ios-done-point': { type: 'string', default: '' },
    'sqlite-gate-port': { type: 'string' },
    'display-start': { type: 'string' },
    'display-text-sizes': { type: 'string', default: 'default,largest' },
    'other-metro-port': { type: 'string' },
    'other-network-port': { type: 'string' },
  },
});
const entryApiVersion = Number(values['entry-api-version']);
const entryReceipts = entryReceiptExpectations(entryApiVersion);
assert(['ios', 'android'].includes(values.platform), 'Use --platform ios|android');
assert(values.device, 'Select a simulator with --device <UUID or emulator serial>');
assert(values.fixture, 'Use --fixture <path printed by dev:mobile-api>');
assert(
  !values['ios-done-point'] || /^\d{1,2}%,\d{1,2}%$/.test(values['ios-done-point']),
  'Use --ios-done-point <x%,y%> only after visually checking the numeric keyboard accessory'
);
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
    'entry',
    'drafts',
    'draft-display',
  ].includes(values.suite),
  'Use --suite auth-trips|sessions|lifecycle|network|appearance|expiry|locales|keyboard|ledger|entry|drafts|draft-display'
);
const needsControl = values.suite !== 'auth-trips';
if (['drafts', 'draft-display'].includes(values.suite))
  assert(
    values['native-sqlite'],
    'Draft acceptance requires --native-sqlite to verify the device database'
  );
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
const usesWriterTrip = ['entry', 'locales', 'keyboard', 'drafts', 'draft-display'].includes(
  values.suite
);
if (usesWriterTrip) {
  assert(/^[a-f0-9]{24}$/.test(fixture.writerTrip), 'Invalid writerTrip; restart dev:mobile-api');
  for (const key of ['writer', 'peer', 'virtual', 'removed'])
    assert(
      /^[a-f0-9]{24}$/.test(fixture.writerMembers?.[key]),
      `Invalid writerMembers.${key}; restart dev:mobile-api`
    );
}
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
// Maestro reads these as regular expressions; the app's own sentences are literal text.
const exact = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function localizedEnv(locale) {
  const t = messages[locale];
  return {
    MAESTRO_SELECT_LATIN_KEYBOARD: String(locale !== 'en'),
    MAESTRO_ENTRY_LIST_START: String(['zh', 'jp'].includes(locale)),
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
    MAESTRO_ADD_EXPENSE: exact(t.addExpense),
    MAESTRO_DRAFT_SAVED: exact(t.draftSaved),
    MAESTRO_DRAFT_SAVE_FAILED: exact(t.draftSaveFailed),
    MAESTRO_DRAFT_DISCARD_FAILED: exact(t.draftDiscardFailed),
    MAESTRO_DRAFT_LOAD_FAILED: exact(t.draftLoadFailed),
    MAESTRO_ENTRY_NOT_SENT: exact(t.entryNotSent),
    MAESTRO_LOCAL_UPDATED: exact(t.localUpdated),
    MAESTRO_LOCAL_DRAFTS: exact(t.localDrafts),
    MAESTRO_LOGOUT: exact(t.logout),
    MAESTRO_LOCAL_SESSION: exact(t.localSessionHint),
    MAESTRO_LOCAL_SNAPSHOT_FAILED: exact(t.localSnapshotFailed),
    MAESTRO_RESTORE_ONLINE: exact(t.restoreOnline),
    MAESTRO_QUEUE_TITLE: exact(t.queueTitle),
    MAESTRO_QUEUE_EMPTY: exact(t.queueEmpty),
    MAESTRO_QUEUE_WAITING: exact(t.queueWaiting),
    MAESTRO_QUEUE_FROZEN: exact(t.queueFrozen),
    MAESTRO_QUEUE_EDIT: exact(t.queueEdit),
    MAESTRO_QUEUE_DISCARD: exact(t.queueDiscard),
    MAESTRO_QUEUE_REPLACE: exact(t.queueReplaceDraft),
    MAESTRO_DESCRIPTION_REQUIRED: exact(t.descriptionRequired),
    MAESTRO_AMOUNT_REQUIRED: exact(t.amountRequired),
    MAESTRO_AMOUNT_FORMAT: exact(t.amountFormat),
    MAESTRO_PREVIEW_NEEDED: exact(t.previewNeeded),
    MAESTRO_ENTRY_REJECTED: exact(t.entryRejected),
    MAESTRO_PENDING_TITLE: exact(t.pendingTitle),
    MAESTRO_PENDING_NOTICE: exact(t.pendingExpensesNotice),
    MAESTRO_PENDING_NOT_FOUND: exact(t.pendingNotFound),
    MAESTRO_PENDING_ACCESS_LOST: exact(t.pendingAccessLost),
    MAESTRO_PENDING_CONFLICT: exact(t.pendingConflict),
  };
}
const env = {
  ...process.env,
  MAESTRO_CLI_NO_ANALYTICS: '1',
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  MAESTRO_APP_ID: values.platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent',
  MAESTRO_EXPO_URL: `exp://127.0.0.1:${port}`,
  MAESTRO_PASSWORD: fixture.password,
  MAESTRO_ENTRY_REJECTED_RECEIPTS: String(entryReceipts.rejected),
  MAESTRO_ENTRY_CORRECTED_RECEIPTS: String(entryReceipts.corrected),
  MAESTRO_SHARED_TRIP: fixture.sharedTrip,
  MAESTRO_PRIVATE_TRIP: fixture.privateTrip,
  MAESTRO_REQUIRE_KEYBOARD: String(values.suite === 'keyboard'),
  MAESTRO_DIRECT_DRAFT_FORM: String(
    ['drafts', 'draft-display'].includes(values.suite) &&
      values.platform === 'ios' &&
      values['text-size'] === 'largest'
  ),
  MAESTRO_IOS_DONE_POINT: values['ios-done-point'] || 'id',
  ...(['ledger', 'locales'].includes(values.suite)
    ? {
        MAESTRO_LEDGER_TRIP: fixture.ledgerTrip,
        MAESTRO_EMPTY_LEDGER_TRIP: fixture.emptyLedgerTrip,
        MAESTRO_SETTLED_LEDGER_TRIP: fixture.settledLedgerTrip,
      }
    : {}),
  ...(usesWriterTrip
    ? {
        MAESTRO_WRITER_TRIP: fixture.writerTrip,
        MAESTRO_REMOVED_ID: fixture.writerMembers.removed,
        MAESTRO_PEER_ID: fixture.writerMembers.peer,
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
  for (const secret of [
    fixture.password,
    fixture.controlToken,
    proxy?.token,
    sqlGate?.token,
  ].filter(Boolean))
    line = line.replaceAll(secret, '[fixture credential]');
  return line;
};
let child;
let proxy;
let otherProxy;
let otherNativeSqlite;
let nativeSqlite;
let checkpointEvidence = {};
let sqlGate;
let nativeConnectivity;
let restoreDisplay;
let restoreAppLocale;
const entryResults = [];
const authTrace = createAuthTrace();
const interrupted = new AbortController();
const stop = () => {
  interrupted.abort();
  child?.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// A wedged XCTest/UIAutomator driver never ends a flow by itself; stop it instead of waiting.
const flowTimeoutMinutes = Number(values['flow-timeout']);
assert(flowTimeoutMinutes > 0, 'Use --flow-timeout <minutes>');
async function runFlow(flow, artifactName = flow) {
  interrupted.signal.throwIfAborted();
  let timedOut = false;
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
  const flowChild = child;
  const timer = setTimeout(() => {
    timedOut = true;
    flowChild.kill('SIGTERM');
    setTimeout(() => flowChild.kill('SIGKILL'), 10_000).unref();
  }, flowTimeoutMinutes * 60_000);
  try {
    await new Promise((resolve, reject) => {
      flowChild.once('error', reject);
      flowChild.once('close', (code) => {
        child = undefined;
        if (timedOut)
          reject(new Error(`Maestro ${flow} timed out after ${flowTimeoutMinutes} minutes`));
        else if (code === 0) resolve();
        else reject(new Error(`Maestro ${flow} failed (${code ?? 'interrupted'})`));
      });
    });
  } finally {
    clearTimeout(timer);
  }
}
async function runEntryFlow(flow, artifactName = flow, locale = values.locale) {
  const from = authTrace.events.length;
  const disconnects = proxy?.counts.disconnect ?? 0;
  const result = { flow, artifactName, locale, apiVersion: entryApiVersion, passed: false };
  entryResults.push(result);
  await runFlow(flow, artifactName);
  if (proxy) {
    verifyEntryTraffic(flow, authTrace.events.slice(from), {
      writer: fixture.writerMembers.writer,
      peer: fixture.writerMembers.peer,
      apiVersion: entryApiVersion,
      counts: { ...proxy.counts, disconnect: proxy.counts.disconnect - disconnects },
    });
  }
  const response = await fetch(`${fixture.controlUrl}/entry-state`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${fixture.controlToken}` },
    signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(5000)]),
  });
  assert.equal(response.status, 200, 'Unable to verify stored expenses');
  result.database = await response.json();
  verifyEntryDatabase(flow, result.database, entryApiVersion);
  result.passed = true;
  console.log(`Verified database${proxy ? ' and backend traffic' : ''} for ${artifactName}.`);
}
try {
  if (values['sqlite-gate-port']) {
    sqlGate = await startNativeSqlGate(Number(values['sqlite-gate-port']));
    env.MAESTRO_SQL_GATE_URL = sqlGate.url;
    env.MAESTRO_SQL_GATE_TOKEN = sqlGate.token;
  }
  restoreDisplay = configureNativeDisplay(values.platform, values.device, {
    appearance: values.appearance,
    textSize: values['text-size'],
  });
  if (values['native-locale'] && values.suite !== 'locales')
    restoreAppLocale = configureNativeLocale(values.platform, values.device, values.locale);
  if (['network', 'expiry', 'entry'].includes(values.suite) || values['network-port']) {
    const networkPort = Number(values['network-port']);
    assert(
      Number.isInteger(networkPort) && networkPort > 0 && networkPort < 65536,
      'Use --network-port <unused local port>; Metro API must use this proxy port'
    );
    proxy = await startNetworkProxy(
      fixture.apiUrl,
      networkPort,
      authTrace.observe,
      values['native-sqlite']
        ? async (command) => {
            if (command.startsWith('native-radio-')) {
              assert.equal(values.platform, 'android', 'iOS simulator has no airplane radio');
              nativeConnectivity ??= createNativeConnectivity(values.device);
              return nativeConnectivity.command(command);
            }
            if (command === 'sqlite-await-known-denial') {
              const after = sqlGate?.events.findLast((e) => e.held)?.at;
              assert(after, 'The SQL transaction must actually be held');
              for (let attempt = 0; attempt < 100; attempt++) {
                if (
                  authTrace.events.some(
                    (e) =>
                      e.at > after &&
                      e.method === 'GET' &&
                      e.path.endsWith(`/trips/${fixture.writerTrip}/expense-options`) &&
                      [403, 404].includes(e.status) &&
                      !e.injected
                  )
                )
                  return { observed: true };
                await delay(100);
              }
              throw new Error('Device did not observe backend denial during the SQL wait');
            }
            nativeSqlite ??= await createNativeSqliteControl(
              values.platform,
              values.device,
              {
                environment: `http://${values.platform === 'ios' ? '127.0.0.1' : '10.0.2.2'}:${networkPort}/api/v1`,
                accountId: fixture.writerMembers.writer,
                tripId: fixture.writerTrip,
              },
              artifacts
            );
            if (command === 'sqlite-checkpoint-environment-other') {
              assert(otherProxy, 'Configure the alternate API environment first');
              otherNativeSqlite ??= await createNativeSqliteControl(
                values.platform,
                values.device,
                {
                  environment: `http://${values.platform === 'ios' ? '127.0.0.1' : '10.0.2.2'}:${values['other-network-port']}/api/v1`,
                  accountId: fixture.writerMembers.writer,
                  tripId: fixture.writerTrip,
                },
                artifacts
              );
              await otherNativeSqlite.command(command);
              checkpointEvidence['environment-other'] = JSON.parse(
                await readFile(join(artifacts, 'sqlite-environment-other.json'), 'utf8')
              );
              return { checkpoint: 'environment-other' };
            }
            if (command === 'sqlite-await-queue-attention') {
              for (let attempt = 0; attempt < 100; attempt++) {
                await nativeSqlite.command('sqlite-checkpoint-attention-ready');
                const state = JSON.parse(
                  await readFile(join(artifacts, 'sqlite-attention-ready.json'), 'utf8')
                );
                if (
                  state.expense_queue[0]?.status === 'attention' &&
                  state.draft_trip[0]?.denied === 1
                )
                  return { persisted: true };
                await delay(100);
              }
              throw new Error('Late response was not durably blocked by known denial');
            }
            if (command === 'sqlite-await-refresh-failure') {
              for (let attempt = 0; attempt < 100; attempt++) {
                if (
                  authTrace.events.some(
                    (e) => isRefreshPath(e.path) && e.injected && e.status === 500
                  )
                )
                  return { observed: true };
                await delay(100);
              }
              throw new Error('The device did not reach the refresh failure');
            }
            if (command === 'sqlite-await-discarded-generation') {
              const original = checkpointEvidence['edit-original'].expense_draft[0].draft_id;
              for (let attempt = 0; attempt < 100; attempt++) {
                await nativeSqlite.command('sqlite-checkpoint-discard-ready');
                const state = JSON.parse(
                  await readFile(join(artifacts, 'sqlite-discard-ready.json'), 'utf8')
                );
                const draft = state.expense_draft[0];
                if (
                  draft &&
                  draft.draft_id !== original &&
                  JSON.parse(draft.input).description === ''
                )
                  return { persisted: true };
                await delay(100);
              }
              throw new Error('Discard has not durably replaced the old draft generation');
            }
            if (command === 'sqlite-await-rate-limit') {
              for (let attempt = 0; attempt < 100; attempt++) {
                const fault = authTrace.events.findLast((e) => e.injected && e.status === 429);
                await nativeSqlite.command('sqlite-checkpoint-rate-ready');
                const state = JSON.parse(
                  await readFile(join(artifacts, 'sqlite-rate-ready.json'), 'utf8')
                );
                if (fault && state.expense_queue[0]?.next_at >= fault.at + 179000)
                  return { persisted: true };
                await delay(100);
              }
              throw new Error('HTTP 429 cooldown was not durably recorded');
            }
            if (command === 'sqlite-assert-filled') {
              for (let attempt = 0; attempt < 20; attempt++) {
                await nativeSqlite.command('sqlite-checkpoint-filled');
                const state = JSON.parse(
                  await readFile(join(artifacts, 'sqlite-filled.json'), 'utf8')
                );
                if (
                  state.expense_draft.length === 1 &&
                  !JSON.parse(state.expense_draft[0].input).memberIds.includes(
                    fixture.writerMembers.removed
                  )
                ) {
                  checkpointEvidence.filled = state;
                  return { selectedMembers: 3 };
                }
                await delay(150);
              }
              throw new Error('Native draft still includes the member the flow deselected');
            }
            const result = await nativeSqlite.command(command);
            if (result.checkpoint)
              checkpointEvidence[result.checkpoint] = JSON.parse(
                await readFile(join(artifacts, `sqlite-${result.checkpoint}.json`), 'utf8')
              );
            return result;
          }
        : undefined
    );
    env.MAESTRO_NETWORK_URL = proxy.url;
    env.MAESTRO_NETWORK_TOKEN = proxy.token;
    console.log(`Network proxy: ${proxy.url}/api/v1 (Metro must use this API port)`);
  }
  if (values['other-network-port']) {
    assert(
      values.suite === 'drafts' && values['other-metro-port'],
      'Alternate environment requires both ports and the drafts suite'
    );
    const otherPort = Number(values['other-network-port']);
    assert(Number.isInteger(otherPort) && otherPort > 0 && otherPort < 65536);
    otherProxy = await startNetworkProxy(fixture.apiUrl, otherPort, authTrace.observe);
    env.MAESTRO_OTHER_EXPO_URL = env.MAESTRO_EXPO_URL.replace(
      `:${port}`,
      `:${Number(values['other-metro-port'])}`
    );
  }
  // The phone keeps unconfirmed requests across runs; settle leftovers before measuring anything.
  if (usesWriterTrip && values.suite !== 'draft-display') await runFlow('entry-drain');
  if (values.suite === 'locales') {
    const localeFlows = values['locale-flows']?.split(',') ?? [
      'auth-trips',
      'ledger',
      'entry-create',
    ];
    for (const flow of localeFlows)
      assert(
        ['auth-trips', 'ledger', 'entry-create', 'entry-appearance'].includes(flow),
        'Use --locale-flows auth-trips,ledger,entry-create,entry-appearance (or a subset)'
      );
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
        for (const flow of localeFlows) {
          const name = flow === 'auth-trips' ? `locale-${locale}` : `locale-${locale}-${flow}`;
          if (flow.startsWith('entry-')) await runEntryFlow(flow, name, locale);
          else await runFlow(flow, name);
        }
      } finally {
        restoreLocale();
      }
    }
  } else if (values.suite === 'entry') {
    const wanted = values.flows ? values.flows.split(',') : entryFlows;
    for (const flow of wanted)
      assert(entryFlows.includes(flow), `Unknown entry flow ${flow}; use ${entryFlows.join(', ')}`);
    for (const flow of wanted) await runEntryFlow(flow);
  } else if (values.suite === 'draft-display') {
    const displayTextSizes = values['display-text-sizes'].split(',');
    assert(
      displayTextSizes.length > 0 &&
        new Set(displayTextSizes).size === displayTextSizes.length &&
        displayTextSizes.every((size) => ['default', 'largest'].includes(size)),
      'Use --display-text-sizes default|largest|default,largest'
    );
    assert(
      !values['display-start'] ||
        /^(en|zh|zh-CN|jp)-(default|largest)-(light|dark)$/.test(values['display-start']),
      'Invalid display resume profile'
    );
    let displayStarted = !values['display-start'];
    for (const locale of values.locales.split(',')) {
      assert(Object.hasOwn(messages, locale), 'Unsupported D display locale');
      for (const textSize of displayTextSizes) {
        for (const appearance of ['light', 'dark']) {
          const profile = `${locale}-${textSize}-${appearance}`;
          if (!displayStarted && profile === values['display-start']) displayStarted = true;
          if (!displayStarted) continue;
          const restoreLocale = configureNativeLocale(values.platform, values.device, locale);
          const restoreProfile = configureNativeDisplay(values.platform, values.device, {
            textSize,
            appearance,
          });
          const name = `d-display-${locale}-${textSize}-${appearance}`;
          try {
            Object.assign(env, localizedEnv(locale));
            env.MAESTRO_DIRECT_DRAFT_FORM = String(
              values.platform === 'ios' && textSize === 'largest'
            );
            const reset = await fetch(`${fixture.controlUrl}/reset-limits`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${fixture.controlToken}` },
            });
            assert.equal(reset.status, 200);
            const from = authTrace.events.length;
            const result = { flow: 'draft-display', locale, textSize, appearance, passed: false };
            entryResults.push(result);
            await runFlow('draft-display', name);
            const evidence = {};
            for (const checkpoint of [
              'display-saved',
              'display-queued',
              'display-returned',
              'display-discarded',
            ]) {
              evidence[checkpoint] = JSON.parse(
                await readFile(join(artifacts, `sqlite-${checkpoint}.json`), 'utf8')
              );
            }
            const saved = evidence['display-saved'].expense_draft[0];
            const queued = evidence['display-queued'].expense_queue[0];
            const restored = evidence['display-returned'].expense_draft[0];
            assert.equal(JSON.parse(saved.input).amountText, '101');
            assert.equal(JSON.parse(saved.input).description, 'TEST D display');
            assert.equal(queued.status, 'queued');
            assert.equal(evidence['display-queued'].expense_queue.length, 1);
            assert(Object.values(evidence).every((state) => state.pending_expense.length === 0));
            assert.equal(queued.input, saved.input);
            assert.equal(restored.input, saved.input);
            assert.equal(evidence['display-returned'].expense_queue.length, 0);
            assert.equal(
              JSON.parse(evidence['display-discarded'].expense_draft[0].input).description,
              ''
            );
            assert(
              !authTrace.events
                .slice(from)
                .some((e) => e.method === 'POST' && /\/expenses$/.test(e.path)),
              'Display test must not create an expense'
            );
            result.database = await (
              await fetch(`${fixture.controlUrl}/entry-state`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${fixture.controlToken}` },
              })
            ).json();
            assert.equal(result.database.expenses, 0);
            assert.equal(result.database.receipts, 0);
            await writeFile(
              join(artifacts, `${name}-sqlite.json`),
              JSON.stringify(evidence, null, 2),
              { mode: 0o600 }
            );
            result.passed = true;
            console.log(`Verified ${name}: native UI, SQLite, and zero writes.`);
          } finally {
            restoreProfile();
            restoreLocale();
          }
        }
      }
    }
    assert(displayStarted, 'The requested display resume profile was not included in --locales');
  } else if (values.suite === 'drafts') {
    const allowed = [
      'draft-restart',
      'draft-offline',
      'draft-expiry',
      'draft-snapshot',
      'draft-accounts',
      'draft-revoked',
      'draft-storage',
      'draft-open-failure',
      'queue-storage',
      'queue-multiple',
      'queue-edit',
      'queue-lost',
      'queue-members',
    ];
    const wanted = values.flows ? values.flows.split(',') : allowed;
    for (const flow of wanted) {
      assert(
        [
          ...allowed,
          'draft-crash',
          'queue-crash',
          'queue-revocation-race',
          'queue-serial-revocation',
          'queue-refresh-revocation',
          'queue-late-options',
          'queue-late-preview',
          'queue-rate-post',
          'queue-rate-lookup',
          'queue-conflict',
          'queue-refresh-failure',
          'queue-credential-failure',
          'draft-legacy',
          'draft-incompatible',
          'draft-edit-race',
          'draft-environments',
        ].includes(flow),
        `Unknown draft flow ${flow}`
      );
      if (
        [
          'draft-crash',
          'queue-crash',
          'queue-revocation-race',
          'queue-serial-revocation',
          'queue-refresh-revocation',
          'queue-late-options',
          'queue-late-preview',
          'queue-credential-failure',
          'draft-legacy',
          'draft-incompatible',
          'draft-edit-race',
        ].includes(flow)
      )
        assert(
          sqlGate,
          'Crash acceptance requires an isolated instrumented checkout and --sqlite-gate-port'
        );
      const from = authTrace.events.length;
      if (flow === 'draft-environments')
        assert(otherProxy, 'Supply both alternate environment ports');
      const gateFrom = sqlGate?.events.length ?? 0;
      const result = { flow, passed: false };
      entryResults.push(result);
      checkpointEvidence = {};
      await runFlow(flow);
      const response = await fetch(`${fixture.controlUrl}/entry-state`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${fixture.controlToken}` },
        signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(5000)]),
      });
      assert.equal(response.status, 200);
      result.database = await response.json();
      const count =
        flow === 'queue-multiple'
          ? 2
          : [
                'queue-lost',
                'queue-members',
                'queue-storage',
                'draft-crash',
                'queue-crash',
                'queue-rate-post',
                'queue-rate-lookup',
                'queue-refresh-failure',
                'queue-credential-failure',
              ].includes(flow)
            ? 1
            : 0;
      assert.equal(result.database.expenses, count);
      assert.equal(result.database.receipts, count);
      const descriptions = {
        'queue-multiple': ['TEST D3 first', 'TEST D3 second'],
        'queue-lost': ['TEST D3 lost response'],
        'queue-members': ['TEST D3 member change'],
        'queue-storage': ['TEST D3 storage failure'],
        'draft-crash': ['TEST D1 transaction crash'],
        'queue-crash': ['TEST D3 transaction crash'],
        'queue-rate-post': ['TEST D3 POST rate limit'],
        'queue-rate-lookup': ['TEST D3 lookup rate limit'],
        'queue-refresh-failure': ['TEST D3 refresh failure'],
        'queue-credential-failure': ['TEST D3 credential failure'],
      };
      assert.deepEqual(result.database.descriptions, descriptions[flow] ?? []);
      assert.deepEqual(result.database.amounts, count === 2 ? [100, 200] : count ? [100] : []);
      const posts = authTrace.events
        .slice(from)
        .filter((e) => e.method === 'POST' && /\/trips\/[^/]+\/expenses$/.test(e.path));
      const expectedStatuses =
        flow === 'queue-refresh-revocation'
          ? [401]
          : flow === 'queue-rate-post'
            ? [429, 200]
            : ['queue-refresh-failure', 'queue-credential-failure'].includes(flow)
              ? [401, 200]
              : flow === 'queue-conflict'
                ? [409]
                : Array(count).fill(200);
      assert.deepEqual(
        posts.map((e) => e.status),
        expectedStatuses,
        'Unexpected native HTTP write attempts'
      );
      assert(posts.every((e) => e.userId === fixture.writerMembers.writer));
      assert(
        posts.every((e) => e.expenseRequest),
        'Writes must retain UUID / byte fingerprint evidence'
      );
      const nativeEvidence = { ...checkpointEvidence };
      const readState = async (name) => {
        const state = JSON.parse(await readFile(join(artifacts, `sqlite-${name}.json`), 'utf8'));
        nativeEvidence[name] = state;
        return state;
      };
      if (flow === 'draft-restart') {
        const before = await readState('restart-before');
        const after = await readState('restart-after');
        assert.equal(before.expense_draft.length, 1);
        assert.equal(after.expense_draft.length, 1);
        assert.equal(before.expense_draft[0].draft_id, after.expense_draft[0].draft_id);
        assert.equal(before.expense_draft[0].input, after.expense_draft[0].input);
        const raw = JSON.parse(after.expense_draft[0].input);
        assert.equal(raw.amountText, '12.');
        assert.equal(raw.date, '2026-');
        assert.equal(raw.category, 'accommodation');
        assert.equal(raw.payerId, fixture.writerMembers.peer);
      }
      if (flow === 'draft-snapshot') {
        const original = await readState('snapshot-original');
        const failed = await readState('snapshot-failed');
        const deniedFailed = await readState('snapshot-deny-failed');
        const denied = await readState('snapshot-deny-recovered');
        const authorized = await readState('snapshot-authorized');
        for (const state of [original, failed, deniedFailed, denied, authorized])
          assert.equal(state.draft_trip.length, 1);
        assert.equal(failed.draft_trip[0].options, original.draft_trip[0].options);
        assert.equal(failed.draft_trip[0].updated_at, original.draft_trip[0].updated_at);
        assert.equal(deniedFailed.draft_trip[0].denied, 0);
        assert.equal(deniedFailed.draft_trip[0].options, original.draft_trip[0].options);
        assert.equal(denied.draft_trip[0].denied, 1);
        assert.equal(denied.draft_trip[0].options, null);
        assert.equal(denied.draft_trip[0].name, null);
        assert.equal(authorized.draft_trip[0].denied, 0);
        assert(authorized.draft_trip[0].options);
        assert(authorized.draft_trip[0].updated_at > original.draft_trip[0].updated_at);
      }
      if (flow === 'draft-expiry') {
        const before = await readState('expiry-before');
        const after = await readState('expiry-after');
        for (const state of [before, after]) {
          assert.equal(state.expense_draft.length, 1);
          assert.equal(state.expense_draft[0].status, 'editing');
          const raw = JSON.parse(state.expense_draft[0].input);
          assert.equal(raw.description, 'TEST D2 offline new draft');
          assert.equal(raw.amountText, '12.');
          assert.equal(raw.date, '2026-');
          assert.equal(state.pending_expense.length, 0);
          assert.equal(state.expense_queue.length, 0);
        }
        assert.equal(after.expense_draft[0].input, before.expense_draft[0].input);
        assert.equal(after.expense_draft[0].draft_id, before.expense_draft[0].draft_id);
        assert(
          authTrace.events
            .slice(from)
            .some((e) => isRefreshPath(e.path) && e.status === 401 && !e.injected),
          'Actual backend session expiry must require login'
        );
      }
      if (values['native-sqlite'] && flow === 'queue-multiple') {
        const before = await readState('multiple-before');
        const after = await readState('multiple-after');
        const synced = await readState('multiple-synced');
        const frozen = (state) =>
          state.expense_queue.map((r) => [r.client_request_id, r.input, r.roster]).sort();
        assert.equal(before.expense_queue.length, 2);
        assert.deepEqual(
          frozen(after),
          frozen(before),
          'Cold restart must retain both UUIDs and raw intentions'
        );
        assert.deepEqual(
          posts.map((e) => e.expenseRequest.id).sort(),
          before.expense_queue.map((r) => r.client_request_id).sort()
        );
        assert.equal(synced.expense_queue.length, 0);
        assert.equal(synced.pending_expense.length, 0);
      }
      if (flow === 'queue-lost') {
        assert.equal(posts[0].dropped, true);
        assert(
          authTrace.events
            .slice(from)
            .some(
              (e) =>
                e.method === 'GET' &&
                /\/expense-requests\/[0-9a-f-]{36}$/.test(e.path) &&
                e.status === 200
            ),
          'Restart must recover the committed receipt without another POST'
        );
        if (values['native-sqlite']) {
          const frozen = await readState('lost-frozen');
          const recovered = await readState('lost-recovered');
          assert.equal(frozen.expense_queue.length, 1);
          assert.equal(frozen.expense_queue[0].status, 'prepared');
          assert.equal(frozen.pending_expense.length, 1);
          const pending = frozen.pending_expense[0];
          assert.equal(pending.client_request_id, posts[0].expenseRequest.id);
          assert.equal(
            createHash('sha256').update(pending.payload).digest('hex'),
            posts[0].expenseRequest.fingerprint
          );
          assert.equal(recovered.expense_queue.length, 0);
          assert.equal(recovered.pending_expense.length, 0);
        }
      }
      if (flow === 'draft-storage') {
        for (const [label, description] of [
          ['save-failed', 'TEST D1 storage original'],
          ['discard-failed', 'TEST D1 storage latest'],
          ['enqueue-failed', 'TEST D1 handoff not sent'],
          ['handoff-failed', 'TEST D1 handoff not sent'],
        ]) {
          const state = await readState(label);
          assert.equal(state.expense_draft.length, 1);
          assert.equal(state.expense_draft[0].status, 'editing');
          assert.equal(JSON.parse(state.expense_draft[0].input).description, description);
          assert.equal(
            state.expense_queue.length,
            0,
            `${label}: failed transaction must not create a queue row`
          );
          assert.equal(
            state.pending_expense.length,
            0,
            `${label}: failed transaction must not create pending`
          );
        }
      }
      if (flow === 'queue-storage') {
        const failed = await readState('prepare-failed');
        const committed = await readState('cleanup-failed');
        const recovered = await readState('cleanup-recovered');
        assert.equal(failed.expense_queue.length, 1);
        assert.equal(failed.expense_queue[0].status, 'queued');
        assert.equal(failed.pending_expense.length, 0);
        assert.equal(committed.expense_queue.length, 1);
        assert.equal(committed.expense_queue[0].status, 'prepared');
        assert.equal(committed.pending_expense.length, 1);
        const pending = committed.pending_expense[0];
        assert.equal(pending.client_request_id, failed.expense_queue[0].client_request_id);
        assert.equal(pending.client_request_id, posts[0].expenseRequest.id);
        assert.equal(
          createHash('sha256').update(pending.payload).digest('hex'),
          posts[0].expenseRequest.fingerprint
        );
        assert.equal(recovered.expense_queue.length, 0);
        assert.equal(recovered.pending_expense.length, 0);
      }
      if (flow === 'queue-rate-post' || flow === 'queue-rate-lookup') {
        const states = await Promise.all(
          ['rate-before', 'rate-restarted', 'rate-manual'].map(readState)
        );
        const original = states[0].pending_expense[0];
        assert(original, 'Cooldown requires the durable C request');
        const id = original.client_request_id;
        const fingerprint = createHash('sha256').update(original.payload).digest('hex');
        for (const state of states) {
          assert.equal(state.expense_queue.length, 1);
          const row = state.expense_queue[0];
          assert.equal(row.status, 'prepared');
          assert.equal(row.client_request_id, id);
          assert(
            row.next_at > state.capturedAt,
            'Manual checks must remain inside the actual persisted cooldown'
          );
          assert.equal(row.next_at, states[0].expense_queue[0].next_at);
          assert.equal(state.pending_expense.length, 1);
          assert.equal(state.pending_expense[0].payload, original.payload);
        }
        const cooldown = states[0].expense_queue[0].next_at;
        const events = authTrace.events.slice(from);
        const fault = events.find((e) => e.injected && e.status === 429);
        assert(fault, 'Expected the injected HTTP 429');
        const requests = events.filter(
          (e) => e.expenseRequest?.id === id || e.path.endsWith(`/expense-requests/${id}`)
        );
        assert(
          requests.filter((e) => e.at > fault.at && e.at < cooldown).length === 0,
          'Cold start and C manual actions must not bypass cooldown'
        );
        assert(
          posts.every(
            (e) => e.expenseRequest.id === id && e.expenseRequest.fingerprint === fingerprint
          )
        );
        const recovered = await readState('rate-recovered');
        assert.equal(recovered.expense_queue.length, 0);
        assert.equal(recovered.pending_expense.length, 0);
      }
      if (flow === 'queue-conflict') {
        const before = await readState('conflict-before');
        const after = await readState('conflict-after');
        assert.equal(before.expense_queue.length, 1);
        assert.equal(after.expense_queue.length, 1);
        assert.equal(before.expense_queue[0].status, 'prepared');
        assert.equal(after.expense_queue[0].reason, 'conflict');
        assert.equal(after.pending_expense.length, 1);
        assert.equal(
          after.pending_expense[0].client_request_id,
          before.pending_expense[0].client_request_id
        );
        assert.equal(after.pending_expense[0].payload, before.pending_expense[0].payload);
        assert.equal(posts[0].expenseRequest.id, after.pending_expense[0].client_request_id);
        assert.equal(
          posts[0].expenseRequest.fingerprint,
          createHash('sha256').update(after.pending_expense[0].payload).digest('hex')
        );
        // Evidence is already saved. Stop the app before removing only this disposable fixture's rows.
        await nativeSqlite.command('sqlite-reset-case');
      }
      if (flow === 'queue-refresh-failure' || flow === 'queue-credential-failure') {
        const failed = await readState('auth-failed');
        const recovered = await readState('auth-recovered');
        assert.equal(failed.expense_queue.length, 1);
        assert.equal(failed.expense_queue[0].status, 'prepared');
        assert.equal(failed.pending_expense.length, 1);
        const pending = failed.pending_expense[0];
        assert(
          posts.every(
            (e) =>
              e.expenseRequest.id === pending.client_request_id &&
              e.expenseRequest.fingerprint ===
                createHash('sha256').update(pending.payload).digest('hex')
          )
        );
        assert.equal(recovered.expense_queue.length, 0);
        assert.equal(recovered.pending_expense.length, 0);
        if (flow === 'queue-refresh-failure') {
          const other = await readState('auth-account-b');
          assert.equal(other.pending_expense[0].payload, pending.payload);
          assert(
            authTrace.events
              .slice(from)
              .some((e) => isRefreshPath(e.path) && e.status === 500 && e.injected)
          );
        } else {
          assert(
            sqlGate.events.slice(gateFrom).some((e) => e.stage === 'credential-set' && e.injected)
          );
          assert(
            authTrace.events
              .slice(from)
              .some((e) => isRefreshPath(e.path) && e.status === 200 && !e.injected)
          );
        }
      }
      if (flow === 'draft-environments') {
        const before = await readState('environment-original');
        const restored = await readState('environment-restored');
        const other = await readState('environment-other');
        const queued = await readState('environment-queued');
        const final = await readState('environment-final');
        assert.equal(before.expense_draft[0].draft_id, restored.expense_draft[0].draft_id);
        assert.equal(before.expense_draft[0].input, restored.expense_draft[0].input);
        assert.equal(other.expense_draft.length, 0);
        assert.equal(other.pending_expense.length, 0);
        assert.equal(other.expense_queue.length, 0);
        assert(other.draft_trip.every((row) => row.options === null));
        assert.equal(queued.expense_queue.length, 1);
        assert.equal(final.expense_queue.length, 1);
        assert.equal(
          queued.expense_queue[0].client_request_id,
          final.expense_queue[0].client_request_id
        );
        assert.equal(queued.expense_queue[0].input, final.expense_queue[0].input);
        assert.equal(final.expense_queue[0].status, 'queued');
        await nativeSqlite.command('sqlite-reset-case');
        await otherNativeSqlite.command('sqlite-reset-case');
      }
      if (flow === 'draft-edit-race') {
        const before = await readState('edit-original');
        const latest = await readState('edit-latest');
        const discarded = await readState('edit-discarded');
        assert.equal(before.expense_draft[0].draft_id, latest.expense_draft[0].draft_id);
        assert.equal(JSON.parse(latest.expense_draft[0].input).description, 'TEST D1 newest edit');
        assert(latest.expense_draft[0].revision > before.expense_draft[0].revision);
        assert.notEqual(discarded.expense_draft[0].draft_id, before.expense_draft[0].draft_id);
        assert.equal(JSON.parse(discarded.expense_draft[0].input).description, '');
        const held = sqlGate.events.slice(gateFrom).filter((e) => e.held);
        assert.equal(held.length, 2);
        assert(
          held.every(
            (e) =>
              e.stage === 'draft-save-before-update' && e.id === before.expense_draft[0].draft_id
          )
        );
      }
      if (['draft-legacy', 'draft-incompatible'].includes(flow)) {
        const stage = flow === 'draft-legacy' ? 'credential-legacy' : 'credential-incompatible';
        assert(sqlGate.events.slice(gateFrom).some((e) => e.stage === stage && e.injected));
        const blocked = await readState('legacy-blocked');
        const restored = await readState('legacy-restored');
        assert.equal(blocked.expense_draft[0].input, restored.expense_draft[0].input);
        assert.equal(
          JSON.parse(restored.expense_draft[0].input).description,
          'TEST D2 legacy slot'
        );
        assert.equal(JSON.parse(restored.expense_draft[0].input).amountText, '12.');
        assert.equal(restored.pending_expense.length, 0);
      }
      if (['queue-serial-revocation', 'queue-refresh-revocation'].includes(flow)) {
        const before = await readState('race-before-release');
        const after = await readState('revoked-prepared');
        assert.equal(before.pending_expense.length, 1);
        assert.equal(after.pending_expense.length, 1);
        assert.equal(
          after.pending_expense[0].client_request_id,
          before.pending_expense[0].client_request_id
        );
        assert.equal(after.pending_expense[0].payload, before.pending_expense[0].payload);
        assert.equal(after.expense_queue[0].status, 'prepared');
        const gates = sqlGate.events.slice(gateFrom);
        const held = gates.find(
          (e) =>
            e.held &&
            e.stage ===
              (flow === 'queue-serial-revocation' ? 'lookup-before-fetch' : 'credential-pause')
        );
        assert(held?.releasedAt, 'Real native request must be paused and released');
        const denial = authTrace.events
          .slice(from)
          .find(
            (e) =>
              e.at > held.at &&
              e.at < held.releasedAt &&
              /expense-options$/.test(e.path) &&
              [403, 404].includes(e.status) &&
              !e.injected
          );
        assert(denial, 'Backend denial must actually be learned before replay');
        if (flow === 'queue-serial-revocation') {
          assert(
            gates.some(
              (e) =>
                e.stage === 'c-retry-enqueued' &&
                e.at >= gates.find((event) => event.stage === 'queue-serial-ready').at &&
                e.at < denial.at &&
                e.id === before.pending_expense[0].client_request_id
            )
          );
          assert.equal(held.id, before.pending_expense[0].client_request_id);
          assert(
            gates.some((e) => e.stage === 'post-before-fetch' && e.at >= held.releasedAt),
            'C retry must reach the actual HTTP guard'
          );
        } else {
          assert(
            authTrace.events
              .slice(from)
              .some((e) => isRefreshPath(e.path) && e.status === 200 && !e.injected)
          );
          assert.equal(posts[0].expenseRequest.id, before.pending_expense[0].client_request_id);
          assert.equal(
            posts[0].expenseRequest.fingerprint,
            createHash('sha256').update(before.pending_expense[0].payload).digest('hex')
          );
        }
        await nativeSqlite.command('sqlite-reset-case');
      }
      if (['queue-late-options', 'queue-late-preview'].includes(flow)) {
        const before = await readState('late-queued');
        const after = await readState('late-revoked');
        assert.equal(before.expense_queue.length, 1);
        assert.equal(after.expense_queue.length, 1);
        assert.equal(
          after.expense_queue[0].client_request_id,
          before.expense_queue[0].client_request_id
        );
        assert.equal(after.expense_queue[0].input, before.expense_queue[0].input);
        assert.equal(after.expense_queue[0].status, 'attention');
        assert.equal(after.expense_queue[0].reason, 'access');
        assert.equal(after.pending_expense.length, 0);
        assert.equal(after.draft_trip[0].denied, 1);
        assert.equal(after.draft_trip[0].options, null);
        const held = sqlGate.events
          .slice(gateFrom)
          .find(
            (e) =>
              e.held &&
              e.stage ===
                (flow === 'queue-late-options'
                  ? 'options-after-response'
                  : 'preview-after-response')
          );
        assert(held?.releasedAt);
        const path = flow === 'queue-late-options' ? /expense-options$/ : /expenses\/preview$/;
        assert(
          authTrace.events
            .slice(from)
            .some((e) => path.test(e.path) && e.status === 200 && e.at <= held.at && !e.injected)
        );
        assert(
          authTrace.events
            .slice(from)
            .some(
              (e) =>
                /expense-options$/.test(e.path) &&
                [403, 404].includes(e.status) &&
                e.at > held.at &&
                e.at < held.releasedAt &&
                !e.injected
            )
        );
        await nativeSqlite.command('sqlite-reset-case');
      }
      if (flow === 'queue-revocation-race') {
        const state = await readState('revoked-prepared');
        assert.equal(state.expense_queue.length, 1);
        assert.equal(state.expense_queue[0].status, 'prepared');
        assert.equal(state.pending_expense.length, 1);
        assert.equal(
          state.pending_expense[0].client_request_id,
          state.expense_queue[0].client_request_id
        );
        const held = sqlGate.events.slice(gateFrom).filter((e) => e.held);
        assert.equal(held.length, 1);
        assert.equal(held[0].stage, 'queue-prepare-after-pending');
        assert.equal(held[0].id, state.pending_expense[0].client_request_id);
        assert(
          authTrace.events
            .slice(from)
            .some(
              (e) =>
                e.method === 'GET' &&
                e.at > held[0].at &&
                /expense-options$/.test(e.path) &&
                [403, 404].includes(e.status)
            ),
          'Known denial must precede the guarded write'
        );
        await nativeSqlite.command('sqlite-reset-case');
      }
      if (flow === 'draft-crash') {
        for (const stage of ['draft-before-pending', 'draft-after-pending']) {
          const state = await readState(stage);
          assert.equal(state.pending_expense.length, 0);
          assert.equal(state.expense_draft.length, 1);
          assert.equal(state.expense_draft[0].status, 'editing');
          assert.equal(
            JSON.parse(state.expense_draft[0].input).description,
            'TEST D1 transaction crash'
          );
        }
        const committed = await readState('draft-after-commit');
        const cleanup = await readState('draft-before-cleanup');
        const recovered = await readState('draft-crash-recovered');
        assert.equal(committed.pending_expense.length, 1);
        assert.equal(committed.expense_draft[0].status, 'handed-off');
        const pending = committed.pending_expense[0];
        assert.equal(pending.client_request_id, committed.expense_draft[0].client_request_id);
        assert.equal(pending.client_request_id, posts[0].expenseRequest.id);
        assert.equal(
          createHash('sha256').update(pending.payload).digest('hex'),
          posts[0].expenseRequest.fingerprint
        );
        assert.equal(cleanup.pending_expense.length, 1);
        assert.equal(cleanup.pending_expense[0].client_request_id, pending.client_request_id);
        assert.equal(cleanup.pending_expense[0].payload, pending.payload);
        assert.equal(recovered.pending_expense.length, 0);
        assert(
          !recovered.expense_draft.some(
            (r) =>
              r.status === 'editing' &&
              JSON.parse(r.input).description === 'TEST D1 transaction crash'
          )
        );
        const held = sqlGate.events.slice(gateFrom).filter((e) => e.held);
        assert.deepEqual(
          held.map((e) => e.stage),
          ['draft-before-pending', 'draft-after-pending', 'draft-after-commit', 'before-cleanup']
        );
        assert.equal(held[2].id, pending.client_request_id);
        assert.equal(held[3].id, pending.client_request_id);
      }
      if (flow === 'queue-crash') {
        for (const stage of ['queue-confirm-before-insert', 'queue-confirm-after-insert']) {
          const state = await readState(stage);
          assert.equal(state.expense_queue.length, 0);
          assert.equal(state.pending_expense.length, 0);
          assert.equal(state.expense_draft[0].status, 'editing');
          assert.equal(
            JSON.parse(state.expense_draft[0].input).description,
            'TEST D3 transaction crash'
          );
        }
        const queued = await readState('queue-confirm-after-commit');
        assert.equal(queued.expense_queue.length, 1);
        assert.equal(queued.expense_queue[0].status, 'queued');
        assert.equal(queued.pending_expense.length, 0);
        assert.equal(queued.expense_draft[0].status, 'discarded');
        const id = queued.expense_queue[0].client_request_id;
        for (const stage of ['queue-prepare-before-pending', 'queue-prepare-after-pending']) {
          const state = await readState(stage);
          assert.equal(state.pending_expense.length, 0);
          assert.equal(state.expense_queue.length, 1);
          assert.equal(state.expense_queue[0].status, 'queued');
          assert.equal(state.expense_queue[0].client_request_id, id);
          assert.equal(state.expense_queue[0].input, queued.expense_queue[0].input);
        }
        const prepared = await readState('queue-prepare-after-commit');
        const cleanup = await readState('queue-before-cleanup');
        const recovered = await readState('queue-crash-recovered');
        assert.equal(prepared.expense_queue[0].status, 'prepared');
        assert.equal(prepared.pending_expense.length, 1);
        const pending = prepared.pending_expense[0];
        assert.equal(pending.client_request_id, id);
        assert.equal(id, posts[0].expenseRequest.id);
        assert.equal(
          createHash('sha256').update(pending.payload).digest('hex'),
          posts[0].expenseRequest.fingerprint
        );
        assert.equal(cleanup.pending_expense.length, 1);
        assert.equal(cleanup.pending_expense[0].client_request_id, id);
        assert.equal(cleanup.pending_expense[0].payload, pending.payload);
        assert.equal(recovered.pending_expense.length, 0);
        assert.equal(recovered.expense_queue.length, 0);
        const held = sqlGate.events.slice(gateFrom).filter((e) => e.held);
        assert.deepEqual(
          held.map((e) => e.stage),
          [
            'queue-confirm-before-insert',
            'queue-confirm-after-insert',
            'queue-confirm-after-commit',
            'queue-prepare-before-pending',
            'queue-prepare-after-pending',
            'queue-prepare-after-commit',
            'before-cleanup',
          ]
        );
        assert(held.slice(2).every((e) => e.id === id));
      }
      await writeFile(
        join(artifacts, flow, 'sqlite-evidence.json'),
        JSON.stringify(nativeEvidence, null, 2) + '\n',
        { mode: 0o600 }
      );
      result.passed = true;
      console.log(`Verified database and HTTP writes for ${flow}.`);
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
    const refreshCount = authTrace.events.filter((e) => isRefreshPath(e.path)).length;
    await runFlow('expiry-restore');
    assert.equal(
      authTrace.events.filter((e) => isRefreshPath(e.path) && e.status === 200).length,
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
    // The add-expense form with the iOS software keyboard: its numeric pad has an accessory Done.
    if (values.suite === 'keyboard') await runEntryFlow('entry-create', 'keyboard-entry');
    if (values.suite === 'network') {
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
    if (proxy) {
      await writeFile(
        join(artifacts, 'auth-trace.json'),
        JSON.stringify(authTrace.events, null, 2),
        {
          mode: 0o600,
        }
      );
    }
    if (sqlGate)
      await writeFile(
        join(artifacts, 'sqlite-gate-events.json'),
        JSON.stringify(sqlGate.events, null, 2) + '\n',
        { mode: 0o600 }
      );
    if (usesWriterTrip) {
      await writeFile(
        join(artifacts, 'entry-results.json'),
        JSON.stringify(
          {
            platform: values.platform,
            locale: values.locale,
            appearance: values.appearance,
            textSize: values['text-size'],
            flows: entryResults,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
    }
  } finally {
    try {
      try {
        await proxy?.close();
      } finally {
        try {
          await otherProxy?.close();
        } finally {
          try {
            await sqlGate?.close();
          } finally {
            try {
              await nativeSqlite?.close();
            } finally {
              try {
                await otherNativeSqlite?.close();
              } finally {
                nativeConnectivity?.close();
              }
            }
          }
        }
      }
    } finally {
      try {
        restoreAppLocale?.();
      } finally {
        try {
          restoreDisplay?.();
        } finally {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
        }
      }
    }
  }
}
