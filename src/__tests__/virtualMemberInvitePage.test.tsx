import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LinkVirtualMemberPage from '@/app/(public)/link-virtual/[tripId]/[username]/page';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getMembers: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ tripId: 'abc123', username: 'virtual_member' }),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: mocks.clear }),
}));

vi.mock('@/actions', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getMembers: mocks.getMembers,
}));

vi.mock('@/components/trips/detail/dialogs', () => ({
  RegisterVirtualMemberDialog: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) =>
    open ? <button onClick={onSuccess}>complete registration</button> : null,
  LinkExistingMemberDialog: ({ open }: { open: boolean }) =>
    open ? <div>existing account dialog</div> : null,
}));

const invitation = {
  trip: { id: 'trip-1', name: 'Tokyo 2026', hash_code: 'abc123' },
  member: {
    id: 'member-1',
    username: 'virtual_member',
    display_name: 'Aki',
    is_virtual: true,
  },
};

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue({ success: false, code: 'UNAUTHORIZED' });
  mocks.getMembers.mockResolvedValue({ success: false, code: 'FORBIDDEN' });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(invitation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('LinkVirtualMemberPage', () => {
  it('shows a stable skeleton while the invitation request is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined))
    );

    render(<LinkVirtualMemberPage />);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('loadFailed')).toBeNull();
  });

  it('renders the invitation before opening an account dialog', async () => {
    render(<LinkVirtualMemberPage />);

    expect(await screen.findByRole('heading', { name: 'Tokyo 2026' })).toBeTruthy();
    expect(screen.getByText('Aki')).toBeTruthy();
    expect(screen.queryByText('existing account dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'linkExisting' }));
    expect(screen.getByText('existing account dialog')).toBeTruthy();
  });

  it('clears stale viewer data and enters the trip after a successful claim', async () => {
    render(<LinkVirtualMemberPage />);
    await screen.findByRole('heading', { name: 'Tokyo 2026' });

    fireEvent.click(screen.getByRole('button', { name: 'registerNew' }));
    fireEvent.click(screen.getByRole('button', { name: 'complete registration' }));

    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith('/trips/abc123');
  });

  it('shows unavailable copy only after the public request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'USER_NOT_FOUND' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    );

    render(<LinkVirtualMemberPage />);

    await waitFor(() => expect(screen.queryByLabelText('Loading')).toBeNull());
    expect(screen.getByText('notFound')).toBeTruthy();
  });
});
