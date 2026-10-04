import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

/** Keep only expiry metadata and one-way fingerprints; never retain credentials or bodies. */
export function createAuthTrace() {
  const events = [];
  return {
    events,
    observe({ method, path, authorization, status, dropped }) {
      const event = { method, path, status, at: Date.now(), ...(dropped ? { dropped: true } : {}) };
      if (authorization?.startsWith('Bearer ')) {
        try {
          const token = authorization.slice(7);
          const { iat, exp, sub } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
          if (Number.isInteger(iat) && Number.isInteger(exp)) {
            event.issuedAt = iat * 1000;
            event.expiresAt = exp * 1000;
            event.fingerprint = createHash('sha256').update(token).digest('hex');
            // Which account made the request: the account id (not a secret), never the token.
            if (typeof sub === 'string' && /^[a-f0-9]{24}$/.test(sub)) event.userId = sub;
          }
        } catch {
          // Invalid bearer values cannot establish an expiry acceptance baseline.
        }
      }
      events.push(event);
    },
  };
}

export function verifyNaturalRefresh(events, original) {
  assert(
    original.status === 200 && original.at < original.expiresAt,
    'Missing valid pre-expiry request'
  );
  assert.equal(original.expiresAt - original.issuedAt, 900_000, 'Expected real 15-minute JWT');
  const deniedIndex = events.findIndex(
    (e) => e.status === 401 && e.fingerprint === original.fingerprint && e.at >= original.expiresAt
  );
  assert(deniedIndex >= 0, 'Missing backend 401 for the naturally expired access JWT');
  const denied = events[deniedIndex];
  const after = events.slice(deniedIndex + 1);
  const refreshes = after.filter((e) => e.path === '/api/v1/auth/refresh');
  assert.equal(refreshes.length, 1, 'Expected exactly one refresh after expiry');
  assert.equal(refreshes[0].status, 200, 'Refresh failed');
  const replay = after.find(
    (e) =>
      e.path === denied.path &&
      e.method === denied.method &&
      e.status === 200 &&
      e.at >= refreshes[0].at &&
      e.fingerprint &&
      e.fingerprint !== original.fingerprint &&
      e.expiresAt > original.expiresAt
  );
  assert(replay, 'Missing successful replay with the refreshed JWT');
}
