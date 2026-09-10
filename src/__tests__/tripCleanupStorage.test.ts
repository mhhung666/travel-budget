import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (original) => ({
  ...(await original<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = mocks.send;
  },
}));
vi.mock('@/lib/env', () => ({
  getR2Config: () => ({
    endpoint: 'https://storage.invalid',
    receiptsBucket: 'private',
    avatarsBucket: 'public',
    accessKeyId: 'dummy',
    secretAccessKey: 'dummy',
  }),
}));
import { deleteObjects, deletePrefixPage } from '@/lib/storage';

describe('durable cleanup storage boundary', () => {
  beforeEach(() => mocks.send.mockReset());
  it('rejects partial S3 deletion errors even when HTTP succeeded', async () => {
    mocks.send.mockResolvedValue({ Errors: [{ Key: 'x', Code: 'AccessDenied' }] });
    await expect(deleteObjects('receipts', ['x'])).rejects.toThrow('incomplete');
  });
  it('deletes one page and reports more work instead of looping without a bound', async () => {
    mocks.send
      .mockResolvedValueOnce({ Contents: [{ Key: 'photos/trip/a' }], IsTruncated: true })
      .mockResolvedValueOnce({});
    expect(await deletePrefixPage('receipts', 'photos/trip/')).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'private',
      Prefix: 'photos/trip/',
      MaxKeys: 1000,
    });
    expect(mocks.send.mock.calls[1][0].input.Delete.Objects).toEqual([{ Key: 'photos/trip/a' }]);
  });
  it('treats an empty prefix as complete without issuing a delete', async () => {
    mocks.send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    expect(await deletePrefixPage('receipts', 'photos/trip/')).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
});
