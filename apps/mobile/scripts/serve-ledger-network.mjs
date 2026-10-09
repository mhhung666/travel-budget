/** Manual B4 transport/evidence channel. Does not control UI or declare native acceptance. */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { startNetworkProxy } from './network-proxy.mjs';
import { createAuthTrace } from './auth-trace.mjs';
import { verifyLedgerTraffic } from './ledger-trace.mjs';

const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    port: { type: 'string' },
    control: { type: 'string' },
    command: { type: 'string' },
  },
});
if (values.control || values.command) {
  assert(
    values.control && values.command && !values.fixture && !values.port,
    'Use --control <network.json> --command <fault>'
  );
  assert(
    [
      'online',
      'disconnect',
      'timeout',
      'drop-write-response',
      'drop-write-response-offline',
      'write-429',
      'mutation-lookup-429',
      'post-429',
      'lookup-429',
    ].includes(values.command),
    'Unsupported B4 network command'
  );
  const control = JSON.parse(await readFile(values.control, 'utf8'));
  const url = new URL(control.url);
  assert(
    url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/',
    'Only the loopback fault channel is supported'
  );
  const response = await fetch(`${url.origin}/__network/${values.command}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${control.token}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200, 'Fault control failed');
  console.log(JSON.stringify(await response.json()));
  process.exit(0);
}
assert(values.fixture && values.port, 'Use --fixture <fixture.json> --port <unused local port>');
const port = Number(values.port);
assert(Number.isInteger(port) && port > 0 && port < 65536);
const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
assert(fixture.ledgerAcceptance, 'Use a disposable B4 fixture from dev:mobile-api');
const artifacts = await mkdtemp(join(tmpdir(), 'travel-budget-ledger-network-'));
const trace = createAuthTrace();
const proxy = await startNetworkProxy(fixture.apiUrl, port, trace.observe);
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const stop = new AbortController();
const onSignal = () => stop.abort();
process.once('SIGINT', onSignal);
process.once('SIGTERM', onSignal);
let sequence = 0;
let snapshots = Promise.resolve();
function snapshot() {
  const name = `traffic-${++sequence}.json`;
  snapshots = snapshots.then(async () => {
    let recovery;
    try {
      const checked = verifyLedgerTraffic(trace.events);
      recovery = {
        status: !checked.observedWrites
          ? 'no-write-baseline'
          : checked.unknownLookups
            ? 'partial-baselines'
            : 'matched-observed-baselines',
        ...checked,
      };
    } catch (error) {
      recovery = { status: 'failed', error: error.message };
      process.exitCode = 1;
    }

    await writeFile(
      join(artifacts, name),
      JSON.stringify(
        {
          format: 1,
          deviceAcceptance: 'pending',
          capturedAt: new Date().toISOString(),
          counts: { ...proxy.counts },
          recovery,
          events: [...trace.events],
        },
        null,
        2
      ),
      { mode: 0o600, flag: 'wx' }
    );
    console.log(`Traffic evidence: ${join(artifacts, name)}`);
  });
  return snapshots;
}
try {
  await writeFile(
    join(artifacts, 'network.json'),
    JSON.stringify({ url: proxy.url, token: proxy.token }),
    { mode: 0o600, flag: 'wx' }
  );
  console.log(`Mobile API (EXPO_PUBLIC_API_BASE_URL): ${proxy.url}`);
  console.log(`Fault control credentials: ${join(artifacts, 'network.json')}`);
  console.log(
    'Commands here: snapshot, quit. Faults: POST /__network/online|disconnect|timeout|drop-write-response|drop-write-response-offline|write-429|mutation-lookup-429 with the local control bearer.'
  );
  terminal.on('line', (line) => {
    if (line.trim() === 'quit') return onSignal();
    if (line.trim() === 'snapshot') void snapshot().catch(() => stop.abort());
  });
  if (!stop.signal.aborted)
    await new Promise((resolve) => stop.signal.addEventListener('abort', resolve, { once: true }));
} finally {
  terminal.close();
  await proxy.close();
  await snapshot();
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
