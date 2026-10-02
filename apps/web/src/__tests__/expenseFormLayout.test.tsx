import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseFormSheet from '@/components/trips/detail/expense-form/ExpenseFormSheet';
import type { Member } from '@/types';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  ReceiptUploader: () => <div data-testid="receipt-uploader" />,
}));

const members = [
  { id: 'me', username: 'amy', display_name: 'Amy', joined_at: '2026-01-01', role: 'admin' },
  { id: 'ben', username: 'ben', display_name: 'Ben', joined_at: '2026-01-01', role: 'member' },
] as Member[];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderForm(props: Partial<Parameters<typeof ExpenseFormSheet>[0]> = {}) {
  // Radix Checkbox（分帳成員列）量測尺寸需要 ResizeObserver，jsdom 沒有。
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: async () => ({ success: true, rates: {} }) })
  );
  return render(
    <ExpenseFormSheet
      mode="add"
      tripId="trip"
      open
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      members={members}
      currentUser={{ id: 'me' }}
      {...props}
    />
  );
}

it('shows payer, date and split summary without opening more settings', async () => {
  const user = userEvent.setup();
  renderForm({ tripName: 'Chengdu' });

  expect(screen.getByLabelText('form.payer')).toBeInTheDocument();
  expect(screen.getByLabelText('form.date')).toBeInTheDocument();
  expect(screen.getAllByText('form.recordingTo').length).toBeGreaterThan(0);
  expect(screen.queryByText('form.tags')).not.toBeInTheDocument();

  const splitToggle = screen.getByRole('button', { name: /form\.splitWith/ });
  expect(splitToggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(splitToggle);
  expect(splitToggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('split.equal')).toBeInTheDocument();
  expect(screen.queryByText('form.tags')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /form\.moreSettings/ }));
  expect(screen.getByText('form.tags')).toBeInTheDocument();
});

it('offers trip switching only when the caller provides it', async () => {
  const user = userEvent.setup();
  const onSwitchTrip = vi.fn();
  const view = renderForm({ tripName: 'Chengdu' });
  expect(screen.queryByRole('button', { name: /form\.switchTrip/ })).not.toBeInTheDocument();

  view.unmount();
  renderForm({ tripName: 'Chengdu', onSwitchTrip });
  await user.click(screen.getByRole('button', { name: /form\.switchTrip/ }));
  expect(onSwitchTrip).toHaveBeenCalledTimes(1);
});

it('explains that the draft stays with this trip once the form has content', async () => {
  const user = userEvent.setup();
  renderForm({ tripId: `trip-${Math.random()}`, tripName: 'Penghu', onSwitchTrip: vi.fn() });
  expect(screen.queryByText('form.switchTripDraftHint')).not.toBeInTheDocument();

  await user.type(screen.getByLabelText('amount'), '120');
  expect(screen.getByText('form.switchTripDraftHint')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /form\.switchTrip/ })).toHaveAttribute(
    'aria-describedby',
    'switch-trip-draft-hint'
  );
});
