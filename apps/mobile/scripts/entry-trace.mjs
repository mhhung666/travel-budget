import assert from 'node:assert/strict';

const WRITE = /^\/api\/v1\/trips\/[a-f0-9]{24}\/expenses$/;
const PREVIEW = /^\/api\/v1\/trips\/[a-f0-9]{24}\/expenses\/preview$/;
const LOOKUP = /^\/api\/v1\/trips\/[a-f0-9]{24}\/expense-requests\/[0-9a-f-]{36}$/;

/** The expense traffic the proxy saw (what reached the backend), split by purpose. */
export function expenseTraffic(events) {
  const pick = (method, pattern) =>
    events.filter((event) => event.method === method && pattern.test(event.path.split('?')[0]));
  return {
    writes: pick('POST', WRITE),
    previews: pick('POST', PREVIEW),
    lookups: pick('GET', LOOKUP),
    refreshes: events.filter((event) => event.path === '/api/v1/auth/refresh'),
  };
}
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
  'entry-lost-retry': ({ writes, lookups }) => {
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
  'entry-retry': ({ writes, lookups }, { counts }) => {
    assert.deepEqual(statuses(writes), [200], 'only the repeat reached the backend');
    assert(!writes[0].dropped);
    assert(counts.disconnect >= 2, 'the first write and its lookup never left the phone');
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
  'entry-rejected': ({ writes }) => {
    assert.deepEqual(statuses(writes), [400, 200], 'refused once, then a new request accepted');
    assert(!writes[0].dropped && !writes[1].dropped);
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

/** Throws when the traffic of one flow contradicts what that scenario promises. */
export function verifyEntryTraffic(flow, events, context) {
  assert(Object.hasOwn(expectations, flow), `No traffic expectation for ${flow}`);
  const traffic = expenseTraffic(events);
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
