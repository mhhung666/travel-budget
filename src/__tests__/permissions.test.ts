import { describe, it, expect, vi, beforeEach } from 'vitest';

// 解析公開分享端點的 hash_code-only 行為，不需真實 DB：mock 連線與 Trip model。
const findOne = vi.fn();

vi.mock('@/lib/mongodb', () => ({
  dbConnect: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/models', () => ({
  Trip: {
    findOne: (...args: unknown[]) => findOne(...args),
  },
}));

import { getTripIdByHashCode } from '@/lib/permissions';

// 讓 Trip.findOne(...).select(...).lean() 鏈回傳指定文件
function mockTripDoc(doc: unknown) {
  findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(doc) }),
  });
}

describe('getTripIdByHashCode (public share resolution)', () => {
  beforeEach(() => {
    findOne.mockReset();
  });

  it('rejects a 24-hex ObjectId without querying the DB', async () => {
    const result = await getTripIdByHashCode('5f9d88b9c4e3a21d4c8b4567');
    expect(result).toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('resolves a valid hash_code by querying { hashCode }', async () => {
    mockTripDoc({ _id: { toString: () => 'trip-object-id' } });
    const result = await getTripIdByHashCode('abc123');
    expect(result).toBe('trip-object-id');
    expect(findOne).toHaveBeenCalledWith({ hashCode: 'abc123' });
  });

  it('returns null when the hash_code does not exist', async () => {
    mockTripDoc(null);
    const result = await getTripIdByHashCode('nope99');
    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ hashCode: 'nope99' });
  });
});
