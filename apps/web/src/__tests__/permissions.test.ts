import { describe, it, expect, vi, beforeEach } from 'vitest';

// 權限解析不需真實 DB：mock 連線與 Trip model。
// findOne 用於 getTripMembership / getTripId / getTripIdByHashCode；
// findById 用於 getTripHashCode。
const findOne = vi.fn();
const findById = vi.fn();

vi.mock('@/lib/mongodb', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models', () => ({
  Trip: {
    findOne: (...args: unknown[]) => findOne(...args),
    findById: (...args: unknown[]) => findById(...args),
  },
}));

import {
  getTripMembership,
  getMemberTrip,
  isAdmin,
  isMember,
  getUserRole,
  getTripId,
  getTripIdByHashCode,
  getTripHashCode,
  requireAdmin,
  requireMember,
} from '@/lib/permissions';

// 讓 Trip.findOne(...).select(...).lean() 鏈回傳指定文件
function mockFindOne(doc: unknown) {
  findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  });
}

// 讓 Trip.findById(...).select(...).lean() 鏈回傳指定文件
function mockFindById(doc: unknown) {
  findById.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  });
}

// 建立一份含 members 的 trip 文件（_id / user 皆以 toString 模擬 ObjectId）
function tripDoc(id: string, members: Array<{ user: string; role: string }>) {
  return {
    _id: { toString: () => id },
    members: members.map((m) => ({ user: { toString: () => m.user }, role: m.role })),
  };
}

const OBJECT_ID = '5f9d88b9c4e3a21d4c8b4567';
const HASH_CODE = 'abc123';

beforeEach(() => {
  findOne.mockReset();
  findById.mockReset();
});

describe('getTripMembership', () => {
  it('resolves an ObjectId via { _id } and returns membership + role', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'admin' }]));
    const result = await getTripMembership('user-1', OBJECT_ID);
    expect(result).toEqual({ tripId: 'trip-1', role: 'admin' });
    expect(findOne).toHaveBeenCalledWith({ _id: OBJECT_ID });
  });

  it('resolves a hash_code via { hashCode }', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    const result = await getTripMembership('user-1', HASH_CODE);
    expect(result).toEqual({ tripId: 'trip-1', role: 'member' });
    expect(findOne).toHaveBeenCalledWith({ hashCode: HASH_CODE });
  });

  it('returns null when the trip does not exist', async () => {
    mockFindOne(null);
    expect(await getTripMembership('user-1', HASH_CODE)).toBeNull();
  });

  it('returns null when the user is not a member of the trip', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'someone-else', role: 'admin' }]));
    expect(await getTripMembership('user-1', HASH_CODE)).toBeNull();
  });
});

describe('getMemberTrip', () => {
  it('combines member authorization and projected Trip loading in one query', async () => {
    const doc = {
      ...tripDoc('trip-1', [{ user: 'user-1', role: 'admin' }]),
      members: [{ user: { toString: () => 'user-1' }, role: 'admin' as const }],
      name: 'Tokyo',
    };
    mockFindOne(doc);
    await expect(getMemberTrip<typeof doc>('user-1', HASH_CODE, 'name')).resolves.toEqual({
      trip: doc,
      membership: { tripId: 'trip-1', role: 'admin' },
    });
    expect(findOne).toHaveBeenCalledWith({ hashCode: HASH_CODE, 'members.user': 'user-1' });
  });
});

describe('isAdmin / isMember / getUserRole', () => {
  it('isAdmin is true only for the admin role', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'admin' }]));
    expect(await isAdmin('user-1', HASH_CODE)).toBe(true);
  });

  it('isAdmin is false for a plain member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    expect(await isAdmin('user-1', HASH_CODE)).toBe(false);
  });

  it('isAdmin is false for a non-member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'other', role: 'admin' }]));
    expect(await isAdmin('user-1', HASH_CODE)).toBe(false);
  });

  it('isMember is true for any member regardless of role', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    expect(await isMember('user-1', HASH_CODE)).toBe(true);
  });

  it('isMember is false for a non-member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'other', role: 'admin' }]));
    expect(await isMember('user-1', HASH_CODE)).toBe(false);
  });

  it('getUserRole returns the role string for a member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    expect(await getUserRole('user-1', HASH_CODE)).toBe('member');
  });

  it('getUserRole returns null for a non-member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'other', role: 'admin' }]));
    expect(await getUserRole('user-1', HASH_CODE)).toBeNull();
  });
});

describe('getTripId', () => {
  it('queries { _id } for an ObjectId and returns the id string', async () => {
    mockFindOne({ _id: { toString: () => 'trip-1' } });
    expect(await getTripId(OBJECT_ID)).toBe('trip-1');
    expect(findOne).toHaveBeenCalledWith({ _id: OBJECT_ID });
  });

  it('queries { hashCode } for a hash_code', async () => {
    mockFindOne({ _id: { toString: () => 'trip-1' } });
    expect(await getTripId(HASH_CODE)).toBe('trip-1');
    expect(findOne).toHaveBeenCalledWith({ hashCode: HASH_CODE });
  });

  it('returns null when nothing matches', async () => {
    mockFindOne(null);
    expect(await getTripId(HASH_CODE)).toBeNull();
  });
});

describe('getTripIdByHashCode (public share resolution)', () => {
  it('rejects a 24-hex ObjectId without querying the DB', async () => {
    const result = await getTripIdByHashCode(OBJECT_ID);
    expect(result).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolves a valid hash_code by querying { hashCode }', async () => {
    mockFindOne({ _id: { toString: () => 'trip-object-id' } });
    const result = await getTripIdByHashCode(HASH_CODE);
    expect(result).toBe('trip-object-id');
    expect(findOne).toHaveBeenCalledWith({ hashCode: HASH_CODE });
  });

  it('returns null when the hash_code does not exist', async () => {
    mockFindOne(null);
    const result = await getTripIdByHashCode('nope99');
    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ hashCode: 'nope99' });
  });
});

describe('getTripHashCode', () => {
  it('returns the hashCode for an existing trip', async () => {
    mockFindById({ hashCode: 'xyz789' });
    expect(await getTripHashCode('trip-1')).toBe('xyz789');
    expect(findById).toHaveBeenCalledWith('trip-1');
  });

  it('returns null when the trip does not exist', async () => {
    mockFindById(null);
    expect(await getTripHashCode('trip-1')).toBeNull();
  });
});

describe('requireAdmin / requireMember', () => {
  it('requireAdmin resolves silently for an admin', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'admin' }]));
    await expect(requireAdmin('user-1', HASH_CODE)).resolves.toBeUndefined();
  });

  it('requireAdmin throws for a non-admin', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    await expect(requireAdmin('user-1', HASH_CODE)).rejects.toThrow(/Admin role required/);
  });

  it('requireMember resolves silently for a member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'user-1', role: 'member' }]));
    await expect(requireMember('user-1', HASH_CODE)).resolves.toBeUndefined();
  });

  it('requireMember throws for a non-member', async () => {
    mockFindOne(tripDoc('trip-1', [{ user: 'other', role: 'admin' }]));
    await expect(requireMember('user-1', HASH_CODE)).rejects.toThrow(/Trip member required/);
  });
});
