import assert from 'node:assert/strict';
import { isRefreshPath } from './auth-trace.mjs';

const WRITE = /^\/api\/v[12]\/trips\/[a-f0-9]{24}\/expenses$/;
const PREVIEW = /^\/api\/v[12]\/trips\/[a-f0-9]{24}\/expenses\/preview$/;
const LOOKUP = /^\/api\/v[12]\/trips\/[a-f0-9]{24}\/expense-requests\/[0-9a-f-]{36}$/;

const versionOf = (event) => Number(event.path.match(/^\/api\/v([12])\//)[1]);

/**
 * The expense traffic the proxy saw (what reached the backend), split by purpose. A v2 request
 * asks for its receipt before every send (`ExpenseEntry.retry`), so the lookup right before each
 * v2 write is that pre-send check, not a recovery lookup; it is reported apart as `checks`.
 */
export function expenseTraffic(events) {
  const pick = (method, pattern) =>
    events.filter((event) => event.method === method && pattern.test(event.path.split('?')[0]));
  const writes = pick('POST', WRITE);
  const previews = pick('POST', PREVIEW);
  const allLookups = pick('GET', LOOKUP);
  const versions = new Set([...writes, ...previews, ...allLookups].map(versionOf));
  assert(versions.size <= 1, 'an expense operation switched API version');
  const version = versions.size ? [...versions][0] : undefined;
  const ordered = events.filter((event) => writes.includes(event) || allLookups.includes(event));
  const checks = [];
  if (version === 2)
    for (const write of writes) {
      const before = ordered[ordered.indexOf(write) - 1];
      assert(
        before && allLookups.includes(before) && before.status === 200 && !checks.includes(before),
        'a v2 write was sent without first asking for its receipt'
      );
      if (write.expenseRequest)
        assert(
          before.path.endsWith(`/expense-requests/${write.expenseRequest.id}`),
          'the pre-send check asked about another request'
        );
      checks.push(before);
    }
  return {
    version,
    writes,
    previews,
    checks,
    lookups: allLookups.filter((event) => !checks.includes(event)),
    refreshes: events.filter((event) => isRefreshPath(event.path)),
  };
}
const after = (events, first, then) => events.indexOf(then) > events.indexOf(first);
const statuses = (list) => list.map((event) => event.status);
const bySomeoneElse = (list, account) => list.filter((event) => event.userId !== account);

/**
 * What the backend must have seen in each scenario, independent of what the app displayed. An
 * answer that is dropped still counts as a write the backend handled. These make the "never
 * written twice, never sent for another account" claims checkable from the wire.
 */
const expectations = {
  'entry-create': ({ writes, previews, lookups }) => {
    assert.deepEqual(statuses(writes), [200], 'one write');
    assert(!writes[0].dropped);
    assert(previews.length >= 2, 'the split was previewed again after the amount was restored');
    assert.equal(lookups.length, 0, 'a confirmed answer needs no lookup');
  },
  'entry-lost-check': ({ writes, lookups }) => {
    assert.deepEqual(statuses(writes), [200], 'one write, committed');
    assert.equal(writes[0].dropped, true, 'its answer was dropped');
    assert.deepEqual(statuses(lookups), [200], 'the lookup found it');
  },
  'entry-lost-retry': ({ version, writes, lookups }, { events }) => {
    if (version === 2) {
      // Retry asks first; the committed receipt settles it and nothing is sent again.
      assert.deepEqual(statuses(writes), [200], 'one write; the retry found it instead');
      assert.equal(writes[0].dropped, true);
      assert.deepEqual(statuses(lookups), [200], 'the retry looked the request up once');
      assert(after(events, writes[0], lookups[0]), 'the retry lookup followed the lost write');
      return;
    }
    assert.deepEqual(statuses(writes), [200, 200], 'the write, then its identical repeat');
    assert.equal(writes[0].dropped, true);
    assert(!writes[1].dropped);
    assert.equal(lookups.length, 0);
  },
  'entry-lost-restart': ({ writes, lookups }) => {
    assert.deepEqual(statuses(writes), [200], 'a single write; the reopened app only looked');
    assert.equal(writes[0].dropped, true);
    assert(lookups.length >= 1 && lookups.every((event) => event.status === 200));
  },
  'entry-retry': ({ version, writes, lookups }, { counts }) => {
    assert.deepEqual(statuses(writes), [200], 'only the repeat reached the backend');
    assert(!writes[0].dropped);
    // v1 sends, then looks up; v2 stops at its pre-send check, so nothing was sent to be lost.
    if (version === 2) assert(counts.disconnect >= 1, 'the first attempt never left the phone');
    else assert(counts.disconnect >= 2, 'the first write and its lookup never left the phone');
    assert(lookups.length >= 1 && lookups.at(-1).status === 200);
  },
  'entry-accounts': ({ writes, lookups }, { events, writer, peer }) => {
    assert.deepEqual(statuses(writes), [200], 'one write in the whole scenario');
    assert.equal(writes[0].userId, writer);
    assert(lookups.length >= 1, 'the account that wrote looked its request up');
    assert.deepEqual(bySomeoneElse(lookups, writer), [], 'no one else asked about that request');
    assert(
      events.some((event) => event.userId === peer),
      'the other account really used the app'
    );
  },
  'entry-access': ({ writes, lookups }) => {
    assert.deepEqual(statuses(writes), [200]);
    assert.equal(writes[0].dropped, true);
    assert.deepEqual(statuses(lookups), [404, 200], 'refused while out of the trip, found after');
  },
  'entry-session': ({ writes, lookups, refreshes }) => {
    assert.deepEqual(statuses(writes), [200], 'the request was never sent again');
    assert.equal(statuses(lookups)[0], 401, 'the first lookup was refused');
    assert(
      refreshes.some((event) => event.status === 401),
      'and the session could not be refreshed'
    );
    assert.equal(lookups.at(-1).status, 200, 'after signing in again the request was found');
  },
  'entry-rejected': ({ version, writes, lookups }, { events }) => {
    assert.deepEqual(statuses(writes), [400, 200], 'refused once, then a new request accepted');
    assert(!writes[0].dropped && !writes[1].dropped);
    if (version !== 2) return assert.equal(lookups.length, 0);
    // A v2 refusal is only final once its receipt says rejected.
    assert.deepEqual(statuses(lookups), [200], 'the refusal was confirmed by its receipt');
    assert(after(events, writes[0], lookups[0]) && after(events, lookups[0], writes[1]));
    if (writes[0].expenseRequest && writes[1].expenseRequest)
      assert.notEqual(
        writes[0].expenseRequest.id,
        writes[1].expenseRequest.id,
        'the corrected request is a new submission'
      );
  },
  'entry-appearance': ({ writes, previews, lookups }) => {
    assert.deepEqual(statuses(writes), [200], 'one write');
    assert(!writes[0].dropped);
    assert(previews.length >= 1, 'the split was previewed first');
    assert.equal(lookups.length, 0, 'a confirmed answer needs no lookup');
  },
  'entry-preview-revoked': ({ writes, previews, lookups }, { events }) => {
    assert.deepEqual(statuses(previews), [200, 404], 'the split was shown, then refused');
    assert.equal(writes.length, 0, 'nothing was ever sent to be written');
    assert.equal(lookups.length, 0);
    assert(
      events.some(
        (event) =>
          event.method === 'GET' && /\/expense-options$/.test(event.path) && event.status === 404
      ),
      'the member options were reread and refused too'
    );
  },
};
export const entryFlows = Object.keys(expectations);

/**
 * D `queue-conflict`: the injected POST 409 is answered, and the first lookup after it is the
 * injected 403. v2 asks for its receipt before the POST (split off as the check); v1 does not.
 */
export function verifyConflictTraffic(events) {
  const traffic = expenseTraffic(events);
  const { writes, lookups } = traffic;
  assert.deepEqual(statuses(writes), [409], 'one write, refused as a conflict');
  assert.equal(writes[0].injected, true, 'the conflict was the injected one');
  assert.equal(traffic.checks.length, traffic.version === 2 ? 1 : 0);
  assert(
    lookups.every((event) => after(events, writes[0], event)),
    'no recovery lookup before the write'
  );
  assert.equal(lookups[0]?.status, 403, 'the lookup following the conflict was refused');
  assert.equal(lookups[0].injected, true, 'the refusal was the injected one');
  return traffic;
}

/** Throws when the traffic of one flow contradicts what that scenario promises. */
export function verifyEntryTraffic(flow, events, context) {
  assert(Object.hasOwn(expectations, flow), `No traffic expectation for ${flow}`);
  const traffic = expenseTraffic(events);
  if (context.apiVersion !== undefined)
    assert.equal(traffic.version, context.apiVersion, 'Unexpected expense API version');
  const { writer } = context;
  // Whatever the scenario, the writes and lookups belong to the writer.
  assert.deepEqual(
    bySomeoneElse(traffic.writes, writer),
    [],
    'a write was made by another account'
  );
  expectations[flow](traffic, { ...context, events });
  return traffic;
}

/** v2 retains the terminal refusal as well as the corrected request's committed receipt. */
export function entryReceiptExpectations(apiVersion) {
  assert([1, 2].includes(apiVersion), 'Expense API version must be 1 or 2');
  return { rejected: apiVersion === 2 ? 1 : 0, corrected: apiVersion === 2 ? 2 : 1 };
}

/** Check the stored ledger independently of the success text displayed by the app. */
export function verifyEntryDatabase(flow, database, apiVersion = 2) {
  assert(Object.hasOwn(expectations, flow), `No database expectation for ${flow}`);
  const receipts = entryReceiptExpectations(apiVersion);
  const expected = flow === 'entry-preview-revoked' ? 0 : 1;
  assert.equal(database.expenses, expected, 'Unexpected DB expense count');
  assert.equal(
    database.receipts,
    flow === 'entry-rejected' ? receipts.corrected : expected,
    'Unexpected DB receipt count'
  );
  const amount = flow === 'entry-retry' ? 50 : flow === 'entry-lost-retry' ? 75.5 : 100;
  assert.deepEqual(database.amounts, expected ? [amount] : [], 'Unexpected stored amount');
}
