import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearTripAccessModes, fetchWithPublicFallback } from '@/hooks/queries/fetcher';

afterEach(() => {
  clearTripAccessModes();
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

  it('sends a known logged-out visitor directly to the public endpoint', async () => {
    const serverAction = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ trip: { id: 'public-trip' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchWithPublicFallback(
        'a7x9k2',
        serverAction,
        { path: '', responseKey: 'trip' },
        null,
        false
      )
    ).resolves.toEqual({ id: 'public-trip' });
    expect(serverAction).not.toHaveBeenCalled();
  });

  it('shares a non-member access decision across concurrent resource queries', async () => {
    let release!: () => void;
    const firstAction = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ success: false, error: 'NOT_FOUND', code: 'NOT_FOUND' });
        })
    );
    const secondAction = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchWithPublicFallback(
      'a7x9k2',
      firstAction,
      { path: 'expenses', responseKey: 'rows' },
      [],
      true
    );
    const second = fetchWithPublicFallback(
      'a7x9k2',
      secondAction,
      { path: 'itinerary', responseKey: 'rows' },
      [],
      true
    );
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
    expect(firstAction).toHaveBeenCalledOnce();
    expect(secondAction).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
