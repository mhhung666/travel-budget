import { expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/api/client';
import { SessionManager } from '@/api/session';
import {
  friendInviteInput,
  friendCommandInput,
  friendsSchema,
  type Friends,
} from '@travel-budget/contracts';
import { FriendsManager } from './FriendsManager';
const alice = { id: 'a'.repeat(24), username: 'alice', displayName: 'Alice' };
const bob = { id: 'b'.repeat(24), username: 'bob', displayName: 'Bob' };
const tripId = 'd'.repeat(24),
  relationId = 'c'.repeat(24);
const row = {
  id: relationId,
  status: 'pending' as const,
  requestedByMe: false,
  user: { ...bob, avatarUrl: null },
  createdAt: '2026-10-12T00:00:00.000Z',
};
const empty: Friends = { friends: [], incoming: [], outgoing: [] };
const initial: Friends = { ...empty, incoming: [row] };
const ok = (data: unknown) => Response.json({ data });
const error = (code: string, status: number) => Response.json({ error: { code } }, { status });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
async function setup(
  handler?: (url: string, init?: RequestInit) => Promise<Response>,
  source = false
) {
  let available = true,
    visible = true,
    epoch = 1;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/login'))
      return ok({
        user: JSON.parse(String(init?.body)).username === 'bob' ? bob : alice,
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
      });
    if (handler) return handler(url, init);
    if (url.endsWith('/members'))
      return ok({
        tripId,
        role: 'member',
        revision: 'e'.repeat(64),
        ledger: { baseCurrency: 'TWD', moneyScale: 2 },
        members: [
          { id: bob.id, displayName: 'Bob', isVirtual: false, role: 'member', joinedAt: null },
        ],
      });
    return ok(init?.method === 'POST' ? { status: 'accepted' } : initial);
  });
  const store = { get: async () => null, set: vi.fn(async () => {}), clear: async () => {} };
  const session = new SessionManager(
    new ApiClient('https://example.invalid/api/v2', fetcher),
    store,
    async () => {}
  );
  await session.login('alice', 'password');
  const manager = new FriendsManager(
    session,
    () => available,
    source ? { tripId, targetUserId: bob.id } : undefined,
    () => {
      const captured = epoch;
      return () => {
        if (!visible || captured !== epoch) throw new ApiError('NOT_FOUND', 404);
      };
    }
  );
  return {
    manager,
    session,
    fetcher,
    store,
    online: (v: boolean) => {
      available = v;
    },
    revoke: () => {
      visible = false;
      epoch++;
    },
  };
}
const writes = (h: Awaited<ReturnType<typeof setup>>) =>
  h.fetcher.mock.calls.filter(([u, i]) => i?.method === 'POST' && !u.endsWith('/login'));
it('strict contracts reject actor overrides, invalid commands, private fields and malformed targets', () => {
  expect(friendInviteInput.safeParse({ target_user_id: bob.id, actorId: alice.id }).success).toBe(
    false
  );
  expect(friendInviteInput.safeParse({ target_user_id: 'Bob' }).success).toBe(false);
  expect(friendCommandInput.safeParse({ action: 'cancel' }).success).toBe(false);
  expect(
    friendsSchema.safeParse({
      ...initial,
      incoming: [{ ...row, user: { ...row.user, email: 'secret' } }],
    }).success
  ).toBe(false);
});
it.each(['accept', 'decline', 'withdraw', 'remove'] as const)(
  'sends %s once to its role-appropriate relation and refreshes current state',
  async (action) => {
    const group = action === 'remove' ? 'friends' : action === 'withdraw' ? 'outgoing' : 'incoming';
    const data = {
      ...empty,
      [group]: [
        {
          ...row,
          status: action === 'remove' ? 'accepted' : 'pending',
          requestedByMe: action === 'withdraw',
        },
      ],
    };
    let changed = false;
    const h = await setup(async (_url, init) => {
      if (init?.method === 'POST') {
        changed = true;
        return ok({ status: action === 'accept' ? 'accepted' : 'deleted' });
      }
      return ok(changed ? empty : data);
    });
    await h.manager.read();
    await Promise.all([h.manager.mutate(action, relationId), h.manager.mutate(action, relationId)]);
    expect(writes(h)).toHaveLength(1);
    expect(writes(h)[0][0]).toMatch(`/me/friends/${relationId}`);
    expect(JSON.parse(String(writes(h)[0][1]?.body))).toEqual({ action });
    expect(h.manager.getSnapshot()).toMatchObject({
      data: empty,
      busy: false,
      uncertain: false,
      needsRefresh: false,
    });
    expect(h.store.set).toHaveBeenCalledTimes(1);
  }
);
it('does not send actions against another role, nonexistent relation or a fabricated target', async () => {
  const h = await setup();
  await h.manager.read();
  for (const action of ['withdraw', 'remove', 'invite'] as const)
    await h.manager.mutate(action, relationId);
  await h.manager.mutate('accept', 'f'.repeat(24));
  expect(writes(h)).toHaveLength(0);
});
it('unknown outcomes freeze mutations; failed reads stay frozen and successful reads report current relations', async () => {
  let failed = false;
  const h = await setup(async (_url, init) => {
    if (init?.method === 'POST') {
      failed = true;
      throw Error('lost response');
    }
    if (failed) throw Error('network');
    return ok(initial);
  });
  await h.manager.read();
  await h.manager.mutate('accept', relationId);
  expect(h.manager.getSnapshot()).toMatchObject({ uncertain: true, result: undefined });
  await h.manager.read();
  await h.manager.mutate('accept', relationId);
  expect(writes(h)).toHaveLength(1);
  failed = false;
  await h.manager.read();
  expect(h.manager.getSnapshot()).toMatchObject({ uncertain: false, result: 'current' });
  const restarted = new FriendsManager(h.session, () => true);
  expect(restarted.getSnapshot().data).toBeUndefined();
  await restarted.read();
  expect(writes(h)).toHaveLength(1);
});
it('confirmed success followed by failed refresh is shown as success and blocks another write until a read', async () => {
  let changed = false;
  const h = await setup(async (_url, init) => {
    if (init?.method === 'POST') {
      changed = true;
      return ok({ status: 'accepted' });
    }
    if (changed) throw Error('refresh failed');
    return ok(initial);
  });
  await h.manager.read();
  await h.manager.mutate('accept', relationId);
  expect(h.manager.getSnapshot()).toMatchObject({
    result: 'accepted',
    uncertain: false,
    needsRefresh: true,
  });
  await h.manager.mutate('accept', relationId);
  expect(writes(h)).toHaveLength(1);
});
it.each(['NOT_FOUND', 'ALREADY_FRIENDS', 'REQUEST_PENDING'])(
  'definite %s refreshes before another explicit action',
  async (code) => {
    const h = await setup(async (_u, i) =>
      i?.method === 'POST' ? error(code, code === 'NOT_FOUND' ? 404 : 409) : ok(initial)
    );
    await h.manager.read();
    await h.manager.mutate('accept', relationId);
    expect(h.manager.getSnapshot()).toMatchObject({
      uncertain: false,
      needsRefresh: true,
      error: { code },
    });
    await h.manager.mutate('accept', relationId);
    expect(writes(h)).toHaveLength(1);
  }
);
it('offline, background and disposal prevent sending', async () => {
  const h = await setup();
  await h.manager.read();
  h.online(false);
  const count = h.fetcher.mock.calls.length;
  await h.manager.mutate('accept', relationId);
  await h.manager.read();
  expect(h.fetcher).toHaveBeenCalledTimes(count);
  expect(h.manager.getSnapshot().uncertain).toBe(false);
  h.online(true);
  h.manager.dispose();
  await h.manager.mutate('accept', relationId);
  expect(writes(h)).toHaveLength(0);
});
it('429 retains a definite rejection and respects Retry-After without an immediate resend', async () => {
  const h = await setup(async (_u, i) =>
    i?.method === 'POST'
      ? Response.json(
          { error: { code: 'RATE_LIMITED' } },
          { status: 429, headers: { 'Retry-After': '120' } }
        )
      : ok(initial)
  );
  await h.manager.read();
  await h.manager.mutate('accept', relationId);
  await h.manager.mutate('accept', relationId);
  expect(writes(h)).toHaveLength(1);
  expect(h.manager.getSnapshot()).toMatchObject({ uncertain: false, error: { retryAfter: 120 } });
});
it.each(['read', 'mutate'] as const)(
  'ignores late %s responses across A→B→A login generations',
  async (method) => {
    const late = deferred<Response>();
    let delay = false;
    const h = await setup(async () => (delay ? late.promise : ok(initial)));
    await h.manager.read();
    delay = true;
    const pending = method === 'read' ? h.manager.read() : h.manager.mutate('accept', relationId);
    await h.session.login('bob', 'password');
    await h.session.login('alice', 'password');
    late.resolve(ok(method === 'read' ? empty : { status: 'accepted' }));
    await pending;
    expect(h.manager.getSnapshot().data).toEqual(initial);
    expect(h.manager.getSnapshot().result).toBeUndefined();
    expect(h.session.getSnapshot().user).toEqual(alice);
  }
);
it('rechecks current trip membership before inviting and prevents sending after revocation', async () => {
  const h = await setup(undefined, true);
  await h.manager.read();
  expect(h.manager.getSnapshot().candidate?.id).toBe(bob.id);
  h.revoke();
  await h.manager.mutate('invite', bob.id);
  expect(writes(h)).toHaveLength(0);
  expect(h.manager.getSnapshot().candidate).toBeUndefined();
});
it('does not invite virtual or departed roster members', async () => {
  for (const members of [
    [],
    [{ id: bob.id, displayName: 'Bob', isVirtual: true, role: 'member', joinedAt: null }],
  ]) {
    const h = await setup(
      async (url) =>
        ok(
          url.endsWith('/members')
            ? {
                tripId,
                role: 'member',
                revision: 'e'.repeat(64),
                ledger: { baseCurrency: 'TWD', moneyScale: 2 },
                members,
              }
            : empty
        ),
      true
    );
    await h.manager.read();
    await h.manager.mutate('invite', bob.id);
    expect(h.manager.getSnapshot().candidate).toBeUndefined();
    expect(writes(h)).toHaveLength(0);
  }
});
it('invites from a fresh real-member roster with a target-only payload and no automatic resend', async () => {
  const h = await setup(undefined, true);
  await h.manager.read();
  await h.manager.mutate('invite', bob.id);
  expect(writes(h)).toHaveLength(1);
  expect(writes(h)[0][0]).toMatch('/me/friends');
  expect(JSON.parse(String(writes(h)[0][1]?.body))).toEqual({ target_user_id: bob.id });
  expect(h.fetcher.mock.calls.filter(([url]) => url.endsWith('/members'))).toHaveLength(2);
});
it('late roster replies cannot revive a revoked invitation source', async () => {
  const late = deferred<Response>();
  const h = await setup(async (url) => (url.endsWith('/members') ? late.promise : ok(empty)), true);
  const pending = h.manager.read();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  h.revoke();
  late.resolve(
    ok({
      tripId,
      role: 'member',
      revision: 'e'.repeat(64),
      ledger: { baseCurrency: 'TWD', moneyScale: 2 },
      members: [
        { id: bob.id, displayName: 'Bob', isVirtual: false, role: 'member', joinedAt: null },
      ],
    })
  );
  await pending;
  await h.manager.mutate('invite', bob.id);
  expect(h.manager.getSnapshot().candidate).toBeUndefined();
  expect(writes(h)).toHaveLength(0);
});
