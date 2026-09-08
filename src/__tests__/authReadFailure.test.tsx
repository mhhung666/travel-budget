import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/hooks/useLogoutFlow', () => ({ useLogoutFlow: () => vi.fn() }));
import { useAuth } from '@/hooks/useAuth';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps the last known user and reports a service failure instead of signing out', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ user: { id: 'user' } }) });
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
  fetchMock.mockResolvedValue({ ok: false, status: 500 });
  await act(async () => {
    await result.current.checkAuth();
  });
  expect(result.current.error).toContain('500');
  expect(result.current.isAuthenticated).toBe(true);
});

it('treats only explicit unauthorized responses as logged out without a service error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  const { result } = renderHook(() => useAuth());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.user).toBeNull();
});
