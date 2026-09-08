import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReadState } from '@/lib/queryReadState';

const mocks = vi.hoisted(() => ({
  shell: vi.fn(),
  user: vi.fn(),
  members: vi.fn(),
  days: vi.fn(),
  tags: vi.fn(),
}));
vi.mock('@/hooks/queries', () => ({
  useTripShell: mocks.shell,
  useCurrentUser: mocks.user,
  useMembers: mocks.members,
  useItinerary: mocks.days,
  useExpenseTags: mocks.tags,
  useExpenseMutations: () => ({}),
  useTripMutations: () => ({}),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
import { useTripSpace } from '@/hooks/useTripSpace';
import { QueryReadDialog } from '@/components/common/QueryReadDialog';
import { combineReadStates } from '@/lib/queryReadState';

const read = (data: unknown): ReadState => ({ data, refetch: vi.fn(), isPending: false });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.shell.mockReturnValue(read({ role: 'member' }));
  mocks.user.mockReturnValue(read({ id: 'user' }));
  mocks.members.mockReturnValue(read([{ id: 'user' }]));
  mocks.days.mockReturnValue(read([]));
  mocks.tags.mockReturnValue(read([]));
});
afterEach(cleanup);

it.each(['shell', 'user', 'members', 'days', 'tags'] as const)(
  'does not open a form when %s fails, even with cached data',
  (key) => {
    const successful = mocks[key]();
    mocks[key].mockReturnValue({ ...successful, isError: true });
    const { result, rerender } = renderHook(() => useTripSpace('trip', true));
    expect(result.current.formReady).toBe(false);
    expect(result.current.formQuery.isError).toBe(true);
    mocks[key].mockReturnValue(successful);
    rerender();
    expect(result.current.formReady).toBe(true);
  }
);

it('accepts successful empty optional metadata but not a null current user', () => {
  const { result, rerender } = renderHook(() => useTripSpace('trip', true));
  expect(result.current.formReady).toBe(true);
  mocks.user.mockReturnValue(read(null));
  rerender();
  expect(result.current.formReady).toBe(false);
});

it('keeps form reads disabled when closed or not a member', () => {
  const { rerender } = renderHook(() => useTripSpace('trip'));
  expect(mocks.user).toHaveBeenLastCalledWith(false);
  expect(mocks.members).toHaveBeenLastCalledWith('trip', false);
  mocks.shell.mockReturnValue(read({ role: null }));
  rerender();
  expect(mocks.days).toHaveBeenLastCalledWith('trip', false);
  expect(mocks.tags).toHaveBeenLastCalledWith('trip', false);
});

it('aggregates only supplied reads and retries all dependencies', async () => {
  const a = read(null);
  const b = read([]);
  const combined = combineReadStates([a, b]);
  expect(combined.data).toBe(true);
  await combined.refetch();
  expect(a.refetch).toHaveBeenCalledOnce();
  expect(b.refetch).toHaveBeenCalledOnce();
});

it.each(['error', 'paused', 'pending', 'denied'] as const)(
  'keeps a %s form bootstrap dismissible',
  (state) => {
    const onClose = vi.fn();
    const refetch = vi.fn();
    render(
      <QueryReadDialog
        query={{
          data: state === 'denied' ? true : undefined,
          isError: state === 'error',
          isPaused: state === 'paused',
          isFetching: state === 'pending',
          refetch,
        }}
        onClose={onClose}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (state === 'error' || state === 'denied') {
      fireEvent.click(screen.getByRole('button', { name: 'retry' }));
      expect(refetch).toHaveBeenCalledOnce();
    }
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  }
);
