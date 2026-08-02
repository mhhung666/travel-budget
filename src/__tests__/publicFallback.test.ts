import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithPublicFallback } from '@/hooks/queries/fetcher';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchWithPublicFallback', () => {
  it('loads the public hash-code endpoint for a logged-in non-member', async () => {
    const serverAction = vi.fn().mockResolvedValue({
      success: false,
      error: 'NOT_FOUND',
      code: 'NOT_FOUND',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ trip: { id: 'trip-id', hash_code: 'a7x9k2' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithPublicFallback('a7x9k2', serverAction, { path: '', responseKey: 'trip' }, null)
    ).resolves.toEqual({ id: 'trip-id', hash_code: 'a7x9k2' });
    expect(fetchMock).toHaveBeenCalledWith('/api/public/trips/a7x9k2/');
  });

  it('does not hide a real server failure behind the public endpoint', async () => {
    const serverAction = vi.fn().mockResolvedValue({
      success: false,
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithPublicFallback('a7x9k2', serverAction, { path: '', responseKey: 'trip' }, null)
    ).rejects.toThrow('INTERNAL_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
