import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';

import RecordPaymentDialog from '@/components/settlement/RecordPaymentDialog';

// Radix Select 在 jsdom 難以操作，換成原生 select；測試只關心付款人＝收款人的判斷。
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const members = [
  { id: 'u1', name: 'Test' },
  { id: 'u2', name: 'Amy' },
];

const recordButton = () => screen.getByRole('button', { name: 'record' });
const selects = () => screen.getAllByRole('combobox');
const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)
    .filter(Boolean);

function renderDialog(props: Partial<Parameters<typeof RecordPaymentDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <RecordPaymentDialog
      open
      onClose={onClose}
      members={members}
      initial={null}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onClose };
}

describe('RecordPaymentDialog same payer and payee', () => {
  it('leaves the chosen payer out of the payee list', () => {
    renderDialog();
    const [payer, payee] = selects();
    expect(optionNames(payee)).toEqual(['Test', 'Amy']);

    fireEvent.change(payer, { target: { value: 'u1' } });
    expect(optionNames(payee)).toEqual(['Amy']);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns and disables record when a prefill makes both the same, then recovers', async () => {
    const { onSubmit, onClose } = renderDialog({
      initial: { fromId: 'u1', toId: 'u1', amount: 10 },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('errorSamePerson'));
    expect(recordButton()).toBeDisabled();

    // 直接送出表單，handler 仍會擋下
    fireEvent.submit(recordButton().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(selects()[1], { target: { value: 'u2' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recordButton()).toBeEnabled();

    fireEvent.click(recordButton());
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        from_id: 'u1',
        to_id: 'u2',
        amount: 10,
        note: undefined,
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('warns as soon as the payer is changed to the current payee', async () => {
    renderDialog({ initial: { fromId: 'u1', toId: 'u2', amount: 10 } });
    await waitFor(() => expect(recordButton()).toBeEnabled());

    fireEvent.change(selects()[0], { target: { value: 'u2' } });
    expect(screen.getByRole('alert')).toHaveTextContent('errorSamePerson');
    expect(recordButton()).toBeDisabled();
  });

  it('explains and disables record when the trip has a single member', () => {
    const { onSubmit } = renderDialog({ members: [members[0]] });
    expect(screen.getByRole('alert')).toHaveTextContent('errorNeedTwoMembers');
    expect(recordButton()).toBeDisabled();

    fireEvent.submit(recordButton().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
