// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('@/lib/env', () => ({
  getR2Config: () => ({
    endpoint: 'https://storage.example.test',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
    receiptsBucket: 'private-receipts',
    avatarsBucket: 'avatars',
  }),
}));
import { presignGet } from '@/lib/storage';
it('signs native receipt cache control and a five-minute lifetime without changing Web defaults', async () => {
  // Signing uses only fake local credentials and never makes a storage/network request.
  const native = new URL(await presignGet('receipts', 'receipts/trip/file.png', { noStore: true }));
  expect(native.searchParams.get('response-cache-control')).toBe('private, no-store');
  expect(native.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(native.searchParams.has('X-Amz-Signature')).toBe(true);
  const web = new URL(await presignGet('receipts', 'receipts/trip/file.png'));
  expect(web.searchParams.has('response-cache-control')).toBe(false);
  expect(web.searchParams.get('X-Amz-Expires')).toBe('300');
});
