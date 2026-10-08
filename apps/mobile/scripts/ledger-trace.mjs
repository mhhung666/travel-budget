import assert from 'node:assert/strict';

/** Frozen-request checks from observed fixture traffic. DB counts and native behavior are separate. */
export function verifyLedgerTraffic(events) {
  const groups = new Map();
  const writes = events.filter((e) => e.mutationRequest);
  for (const e of writes) {
    const path = e.path.split('?')[0];
    const version = /^\/api\/v([12])\//.exec(path)?.[1];
    assert(version && /^[a-f0-9]{24}$/.test(e.userId), 'Missing API version or actor evidence');
    const trip = /^\/api\/v[12]\/trips\/([a-f0-9]{24})\/expenses$/.exec(path)?.[1];
    const domain = e.method === 'POST' && trip ? `C:${trip}` : 'E';
    const id = e.mutationRequest.id.toLowerCase();
    assert(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id),
      'Invalid UUID evidence'
    );
    assert(/^[a-f0-9]{64}$/.test(e.mutationRequest.fingerprint), 'Missing body hash');
    const key = `${domain}:${e.userId}:${id}`;
    const frozen = {
      version: Number(version),
      path,
      method: e.method,
      fingerprint: e.mutationRequest.fingerprint,
    };
    const existing = groups.get(key);
    if (existing) {
      assert.deepEqual(frozen, existing.frozen, 'UUID changed endpoint/version/method/body bytes');
      existing.writes++;
    } else groups.set(key, { domain, actor: e.userId, id, frozen, writes: 1, lookups: 0 });
  }
  let unknownLookups = 0;
  for (const e of events.filter((e) => e.method === 'GET')) {
    const match =
      /^\/api\/v([12])\/(?:trips\/([a-f0-9]{24})\/expense-requests|mutation-requests)\/([0-9a-f-]{36})(?:\?.*)?$/i.exec(
        e.path
      );
    if (!match) continue;
    const domain = match[2] ? `C:${match[2]}` : 'E';
    const id = match[3].toLowerCase();
    const group = groups.get(`${domain}:${e.userId}:${id}`);
    if (group) {
      assert.equal(Number(match[1]), group.frozen.version, 'Recovery changed API version');
      group.lookups++;
    } else {
      assert(
        ![...groups.values()].some((g) => g.domain === domain && g.id === id),
        'Another account queried this operation'
      );
      unknownLookups++;
    }
  }
  return { observedWrites: writes.length, unknownLookups, operations: [...groups.values()] };
}
