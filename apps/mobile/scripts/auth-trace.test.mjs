import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import { createAuthTrace, verifyNaturalRefresh } from './auth-trace.mjs';

test('auth evidence contains no bearer, refresh token or response body', () => {
  const trace = createAuthTrace();
  const account = 'a'.repeat(24);
  const token = `header.${Buffer.from(JSON.stringify({ iat: 10, exp: 910, sub: account })).toString('base64url')}.signature`;
  trace.observe({
    method: 'GET',
    path: '/api/v1/me',
    status: 200,
    authorization: `Bearer ${token}`,
    body: { refreshToken: 'never-retain-me' },
  });
  assert.equal(trace.events[0].issuedAt, 10_000);
  assert.equal(trace.events[0].expiresAt, 910_000);
  assert.match(trace.events[0].fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(trace.events[0].userId, account);
  assert(!JSON.stringify(trace.events).includes(token));
  assert(!JSON.stringify(trace.events).includes('never-retain-me'));
  trace.observe({
    method: 'GET',
    path: '/api/v1/me',
    status: 401,
    authorization: 'Bearer invalid',
  });
  assert.equal(trace.events[1].fingerprint, undefined);
  assert.equal(trace.events[1].userId, undefined);
  trace.observe({ method: 'POST', path: '/api/v1/trips/x/expenses', status: 200, dropped: true });
  assert.equal(trace.events[2].dropped, true);
  assert.equal(trace.events[0].dropped, undefined);
  trace.observe({
    method: 'POST',
    path: '/api/v1/trips/x/expenses',
    status: 200,
    expenseRequest: {
      id: '12345678-1234-4234-8234-123456789012',
      fingerprint: 'a'.repeat(64),
      body: 'private',
    },
  });
  assert.deepEqual(trace.events[3].expenseRequest, {
    id: '12345678-1234-4234-8234-123456789012',
    fingerprint: 'a'.repeat(64),
  });
  assert(!JSON.stringify(trace.events).includes('private'));
});

test('natural expiry requires backend rejection, one refresh and replay with a new JWT', () => {
  const original = {
    method: 'GET',
    path: '/api/v1/trips',
    fingerprint: 'old',
    issuedAt: 1000,
    expiresAt: 901000,
    status: 200,
    at: 2000,
  };
  const denied = { ...original, status: 401, at: 902000 };
  const refresh = { method: 'POST', path: '/api/v1/auth/refresh', status: 200, at: 903000 };
  const replay = { ...original, fingerprint: 'new', expiresAt: 1801000, at: 904000 };
  verifyNaturalRefresh([original, denied, refresh, replay], original);
  for (const events of [
    [original, refresh, replay],
    [original, { ...denied, at: 900000 }, refresh, replay],
    [original, denied, { ...refresh, status: 401 }, replay],
    [original, denied, refresh, refresh, replay],
    [original, denied, refresh, { ...replay, fingerprint: 'old' }],
    [original, denied, refresh, { ...replay, path: '/api/v1/other' }],
  ])
    assert.throws(() => verifyNaturalRefresh(events, original));
  assert.throws(() =>
    verifyNaturalRefresh([denied, refresh, replay], { ...original, issuedAt: 900000 })
  );
});

test('B4 confirmed-mutation evidence keeps only UUID/fingerprint and validates their shape', () => {
  const trace = createAuthTrace();
  const mutationRequest = {
    id: '12345678-1234-4234-8234-123456789012',
    fingerprint: 'c'.repeat(64),
    body: 'private input',
    token: 'private token',
  };
  trace.observe({
    method: 'PATCH',
    path: '/api/v2/trips/x/expenses/y',
    status: 200,
    mutationRequest,
  });
  assert.deepEqual(trace.events[0].mutationRequest, {
    id: mutationRequest.id,
    fingerprint: mutationRequest.fingerprint,
  });
  assert(!JSON.stringify(trace.events).includes('private'));
  trace.observe({
    method: 'POST',
    path: '/api/v2/trips',
    status: 200,
    mutationRequest: { ...mutationRequest, id: 'invalid' },
  });
  assert.equal(trace.events[1].mutationRequest, undefined);
});
