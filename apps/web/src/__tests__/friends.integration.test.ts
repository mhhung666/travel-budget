// @vitest-environment node
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { friendsSchema } from '@travel-budget/contracts';
import { Friendship, User, Trip } from '@/models';
import { inviteFriend, acceptFriend, deleteFriend } from '@/lib/friends';
import {
  getFriends,
  sendFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '@/actions/friend.actions';
import { loginMobile } from '@/lib/mobile/session';
import { GET, POST } from '@/app/api/v2/me/friends/route';
import { POST as command } from '@/app/api/v2/me/friends/[friendshipId]/route';
const h = vi.hoisted(() => ({ actor: '', notify: vi.fn() }));
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ JWT_SECRET: 'isolated-friends-secret-at-least-32-characters' }),
}));
vi.mock('@/lib/mongodb', () => ({ dbConnect: async () => mongoose }));
vi.mock('@/lib/auth', () => ({
  getSession: async () => ({ userId: h.actor }),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/notify', () => ({ notify: h.notify }));
const uri = process.env.MONGODB_MEMBER_TEST_URI;
const allowed = process.env.MONGODB_MEMBER_TEST_ALLOW_WRITES === '1';
if ((uri || allowed) && !(uri && allowed)) throw Error('Requires isolated URI and write opt-in');
describe.skipIf(!uri || !allowed)('M4b relationships on an owned database', () => {
  let owned = false,
    peer = '',
    outsider = '',
    virtual = '';
  let token: Awaited<ReturnType<typeof loginMobile>>;
  beforeAll(async () => {
    await mongoose.connect(uri!, {
      autoCreate: false,
      autoIndex: false,
      dbName: `tb_friends_${randomUUID().replaceAll('-', '')}`,
    });
    expect(await mongoose.connection.db!.listCollections().toArray()).toHaveLength(0);
    await mongoose.connection.db!.createCollection('verification_owner');
    owned = true;
    await Friendship.syncIndexes();
  });
  afterAll(async () => {
    try {
      if (owned) await mongoose.connection.db!.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    h.notify.mockResolvedValue(undefined);
    for (const name of ['users', 'friendships', 'mobilesessions', 'mobileloginattempts', 'trips'])
      await mongoose.connection.db!.collection(name).deleteMany({});
    const password = await bcrypt.hash('password', 10);
    const users = await User.create(
      ['alice', 'bob', 'carol', 'virtual'].map((username) => ({
        username,
        displayName: username,
        email: `${username}@example.invalid`,
        password,
        isVirtual: username === 'virtual',
      }))
    );
    [h.actor, peer, outsider, virtual] = users.map((u) => u._id.toString());
    token = await loginMobile('alice', 'password');
  });
  const req = (body?: unknown, access = token.accessToken) =>
    new Request('https://example.invalid/api/v2/me/friends', {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const act = (id: string, action: string, access = token.accessToken) =>
    command(req({ action }, access), { params: Promise.resolve({ friendshipId: id }) });
  it('shares Web/native current relationships with public identity only, no-store and actor isolation', async () => {
    expect((await sendFriendRequest(peer)).success).toBe(true);
    const first = await GET(req());
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(first.headers.get('vary')).toBe('Authorization');
    const current = friendsSchema.parse((await first.json()).data);
    expect(current.outgoing).toHaveLength(1);
    expect(Object.keys(current.outgoing[0].user).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'id',
      'username',
    ]);
    const bob = await loginMobile('bob', 'password');
    expect((await act(current.outgoing[0].id, 'accept', bob.accessToken)).status).toBe(200);
    expect((await getFriends()).success).toBe(true);
    expect(friendsSchema.parse((await (await GET(req())).json()).data).friends).toHaveLength(1);
    expect((await removeFriend(current.outgoing[0].id)).success).toBe(true);
    expect(friendsSchema.parse((await (await GET(req())).json()).data)).toEqual({
      friends: [],
      incoming: [],
      outgoing: [],
    });
  });
  it('duplicate and opposite-direction concurrent invitations keep one pair and notify once per transition', async () => {
    const duplicate = await Promise.allSettled([
      inviteFriend(h.actor, peer),
      inviteFriend(h.actor, peer),
    ]);
    expect(duplicate.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await Friendship.countDocuments()).toBe(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    await Friendship.deleteMany({});
    h.notify.mockClear();
    const opposite = await Promise.all([inviteFriend(h.actor, peer), inviteFriend(peer, h.actor)]);
    expect(opposite.map((r) => r.status).sort()).toEqual(['accepted', 'pending']);
    expect(await Friendship.countDocuments()).toBe(1);
    expect((await Friendship.findOne().lean())?.status).toBe('accepted');
    expect(h.notify).toHaveBeenCalledTimes(2);
  });
  it('rejects nonparticipants, wrong direction, already processed and repeated commands without changing the relationship', async () => {
    await inviteFriend(peer, h.actor);
    const row = (await Friendship.findOne().lean())!;
    const id = row._id.toString();
    await expect(acceptFriend(outsider, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteFriend(peer, id, 'decline')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteFriend(h.actor, id, 'withdraw')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(deleteFriend(outsider, id, 'remove')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await act(id, 'accept')).status).toBe(200);
    expect((await act(id, 'accept')).status).toBe(404);
    expect((await act(id, 'decline')).status).toBe(404);
    expect((await act(id, 'remove')).status).toBe(200);
    expect((await act(id, 'remove')).status).toBe(404);
  });
  it('accept-vs-cancel has exactly one successful terminal transition, without a phantom acceptance', async () => {
    await inviteFriend(peer, h.actor);
    const row = (await Friendship.findOne().lean())!;
    h.notify.mockClear();
    const results = await Promise.allSettled([
      acceptFriend(h.actor, row._id.toString()),
      deleteFriend(peer, row._id.toString(), 'withdraw'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await Friendship.findById(row._id).lean();
    expect(saved?.status ?? 'deleted').toBe(
      results[0].status === 'fulfilled' ? 'accepted' : 'deleted'
    );
    expect(h.notify).toHaveBeenCalledTimes(saved ? 1 : 0);
  });
  it('strict bearer/input validation rejects forged actors, self, virtual and deleted targets; friendships do not alter trip membership', async () => {
    expect(
      (
        await GET(
          new Request('https://example.invalid/api/v2/me/friends', {
            headers: { Cookie: 'session=anything' },
          })
        )
      ).status
    ).toBe(401);
    expect((await POST(req({ target_user_id: peer }, 'invalid'))).status).toBe(401);
    for (const body of [
      { target_user_id: h.actor.toUpperCase() },
      { target_user_id: virtual },
      { target_user_id: peer, actorId: outsider },
      { target_user_id: 'invalid' },
    ])
      expect((await POST(req(body))).status).toBe(400);
    const before = await Trip.countDocuments();
    await inviteFriend(h.actor, peer);
    expect(await Trip.countDocuments()).toBe(before);
    await expect(
      inviteFriend(h.actor, new mongoose.Types.ObjectId().toString())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await act('invalid', 'remove')).status).toBe(404);
    expect((await act((await Friendship.findOne())!._id.toString(), 'cancel')).status).toBe(400);
  });
  it('committed operations remain successful when notifications fail; old Web cancellation still works', async () => {
    h.notify.mockRejectedValue(new Error('notify unavailable'));
    expect((await POST(req({ target_user_id: peer }))).status).toBe(200);
    expect(await Friendship.countDocuments()).toBe(1);
    const row = (await Friendship.findOne())!;
    expect((await declineFriendRequest(row._id.toString())).success).toBe(true);
    expect(await Friendship.countDocuments()).toBe(0);
  });
});
