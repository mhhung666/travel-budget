/** Run local Expo Go acceptance against the disposable backend fixture. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
// Node 24 can load this pure TypeScript table without changing the Expo package module type.
const { messages } = createRequire(import.meta.url)('../src/i18n/messages.ts');

const { values } = parseArgs({
  options: {
    platform: { type: 'string' },
    device: { type: 'string' },
    fixture: { type: 'string' },
    'metro-port': { type: 'string' },
    locale: { type: 'string', default: 'en' },
    suite: { type: 'string', default: 'auth-trips' },
  },
});
assert(['ios', 'android'].includes(values.platform), 'Use --platform ios|android');
assert(values.device, 'Select a simulator with --device <UUID or emulator serial>');
assert(values.fixture, 'Use --fixture <path printed by dev:mobile-api>');
assert(['auth-trips', 'sessions'].includes(values.suite), 'Use --suite auth-trips|sessions');
assert(Object.hasOwn(messages, values.locale), 'Use --locale en|zh|zh-CN|jp (must match device)');
const port = Number(values['metro-port']);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'Use --metro-port <local Metro port>');
const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
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
const response = await fetch(`${api}/me`, { signal: AbortSignal.timeout(5000) });
assert.equal(response.status, 401, 'Start dev:mobile-api before native acceptance');
if (values.suite === 'sessions') {
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
const t = messages[values.locale];
const env = {
  ...process.env,
  MAESTRO_CLI_NO_ANALYTICS: '1',
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
  MAESTRO_APP_ID: values.platform === 'ios' ? 'host.exp.Exponent' : 'host.exp.exponent',
  MAESTRO_EXPO_URL: `exp://127.0.0.1:${port}`,
  MAESTRO_PASSWORD: fixture.password,
  MAESTRO_SHARED_TRIP: fixture.sharedTrip,
  MAESTRO_PRIVATE_TRIP: fixture.privateTrip,
  MAESTRO_REQUIRED: t.required,
  MAESTRO_INVALID: t.invalidCredentials,
  MAESTRO_EMPTY: t.noTrips,
  MAESTRO_NOT_FOUND: t.notFound,
  MAESTRO_RECEIVABLE: t.receivable,
  MAESTRO_PAYABLE: t.payable,
  MAESTRO_SESSION_EXPIRED: t.sessionExpired,
  ...(values.suite === 'sessions'
    ? { MAESTRO_CONTROL_URL: fixture.controlUrl, MAESTRO_CONTROL_TOKEN: fixture.controlToken }
    : {}),
};
console.log(`Running ${values.platform} native acceptance; local artifacts: ${artifacts}`);
const child = spawn(
  'maestro',
  [
    '--device',
    values.device,
    'test',
    '--no-ansi',
    '--test-output-dir',
    artifacts,
    `maestro/${values.suite}.yaml`,
  ],
  { env, stdio: ['inherit', 'pipe', 'pipe'] }
);
const stop = (signal) => child.kill(signal);
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
// Maestro may echo inputText values; keep the disposable password out of terminal output.
const redact = (line) => {
  for (const secret of [fixture.password, fixture.controlToken].filter(Boolean))
    line = line.replaceAll(secret, '[fixture credential]');
  return line;
};
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
child.on('error', (error) => {
  console.error(`Unable to run Maestro: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code) => {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  process.exitCode = code ?? 1;
});
