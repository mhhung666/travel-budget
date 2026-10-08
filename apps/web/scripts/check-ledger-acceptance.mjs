/** Read-only DB evidence for an operator's B4 fixed-case run; never marks device acceptance. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { verifyLedgerStage } from './ledger-acceptance.mjs';

const { values } = parseArgs({
  options: {
    fixture: { type: 'string' },
    currency: { type: 'string' },
    stage: { type: 'string' },
    output: { type: 'string' },
  },
});
assert(
  values.fixture && values.currency && values.stage,
  'Use --fixture <fixture.json> --currency TWD|USD|JPY --stage empty|expense|partial|revoked [--output <path>]'
);
const fixture = JSON.parse(await readFile(values.fixture, 'utf8'));
assert(fixture.ledgerAcceptance, 'Restart dev:mobile-api to obtain a B4 fixture');
const control = new URL(fixture.controlUrl);
assert(
  control.protocol === 'http:' && control.hostname === '127.0.0.1' && control.pathname === '/',
  'Only the owned loopback fixture control is supported'
);
const response = await fetch(`${control.origin}/b4-state`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${fixture.controlToken}` },
  signal: AbortSignal.timeout(15000),
});
assert.equal(response.status, 200, 'Fixture snapshot failed');
const snapshot = await response.json();
const check = verifyLedgerStage(fixture.ledgerAcceptance, snapshot, values.currency, values.stage);
const report = {
  format: 1,
  capturedAt: snapshot.capturedAt,
  evidence: 'database-fixed-case',
  deviceAcceptance: 'pending',
  check,
  snapshot,
};
if (values.output)
  await writeFile(values.output, JSON.stringify(report, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify(check, null, 2));
console.log(
  'Database values matched. Web/iOS operation, restart and accessibility evidence remain separate.'
);
