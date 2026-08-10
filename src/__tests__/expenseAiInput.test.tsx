import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpenseAiInput } from '@/components/trips/detail/expense-form/ExpenseAiInput';
import type { ExpenseAttachment, Member } from '@/types';

vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  ReceiptUploader: () => <div data-testid="receipt-uploader" />,
}));

const members: Member[] = [
  {
    id: 'member-1',
    username: 'amy',
    display_name: 'Amy',
    joined_at: '2026-01-01',
    role: 'admin',
  },
  {
    id: 'member-2',
    username: 'ben',
    display_name: 'Ben',
    joined_at: '2026-01-01',
    role: 'member',
  },
];

const baseProps = {
  open: true,
  tripId: 'trip-1',
  attachments: [] as ExpenseAttachment[],
  onAttachmentsChange: vi.fn(),
  members,
  onApplyTextDraft: vi.fn(),
  onApplyReceiptDraft: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ExpenseAiInput', () => {
  it('keeps an AI text result pending until the user explicitly applies it', async () => {
    const user = userEvent.setup();
    const onApplyTextDraft = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          draft: {
            description: 'Taxi',
            originalAmount: 1200,
            currency: 'JPY',
            date: '2026-08-09',
            category: 'transportation',
            split: { method: 'equal', participantNames: ['Amy', 'Ben'] },
            warnings: [],
            payerId: 'member-1',
            participantIds: ['member-1', 'member-2'],
            resolvedSplit: {
              mode: 'equal',
              entries: [
                { memberId: 'member-1', value: '' },
                { memberId: 'member-2', value: '' },
              ],
            },
            requiresCorrection: false,
          },
        }),
      })
    );

    render(<ExpenseAiInput {...baseProps} onApplyTextDraft={onApplyTextDraft} />);
    await user.click(screen.getByRole('tab', { name: 'modes.text' }));
    await user.type(screen.getByLabelText('sourceLabel'), 'Taxi 1200 yen');
    await user.click(screen.getByRole('button', { name: 'createDraft' }));

    expect(await screen.findByText('previewTitle')).toBeInTheDocument();
    expect(screen.getByText('Taxi')).toBeInTheDocument();
    expect(screen.getByText('JPY')).toBeInTheDocument();
    expect(onApplyTextDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'apply' }));
    expect(onApplyTextDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'applied' })).toBeDisabled();
  });

  it('shows field-level review markers for an ambiguous receipt before applying it', async () => {
    const user = userEvent.setup();
    const onApplyReceiptDraft = vi.fn();
    const attachments: ExpenseAttachment[] = [
      { key: 'receipts/trip-1/receipt.png', content_type: 'image/png', size: 1000 },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          draft: {
            merchantName: 'Mori Cafe',
            transactionDate: '2026-08-09',
            amountCandidates: [
              { kind: 'total', amount: 12 },
              { kind: 'total', amount: 1200 },
            ],
            suggestedCategory: 'food',
            fieldStatus: {
              merchantName: 'read',
              transactionDate: 'read',
              currency: 'ambiguous',
              total: 'ambiguous',
            },
            warnings: [
              { code: 'AMBIGUOUS_TOTAL', field: 'total' },
              { code: 'AMBIGUOUS_CURRENCY', field: 'currency' },
            ],
          },
        }),
      })
    );

    render(
      <ExpenseAiInput
        {...baseProps}
        attachments={attachments}
        onApplyReceiptDraft={onApplyReceiptDraft}
      />
    );
    await user.click(screen.getByRole('tab', { name: 'modes.receipt' }));
    await user.click(screen.getByRole('button', { name: 'scan' }));

    expect(await screen.findByText('previewTitle')).toBeInTheDocument();
    expect(screen.getAllByText('notRecognized')).toHaveLength(2);
    expect(screen.getAllByLabelText('needsReview')).toHaveLength(2);
    expect(onApplyReceiptDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'apply' }));
    expect(onApplyReceiptDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps manual entry available and presents provider errors without discarding input', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ success: false, error: { code: 'RATE_LIMITED' } }),
      })
    );

    render(<ExpenseAiInput {...baseProps} />);
    expect(screen.getByText('manualHint')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'modes.text' }));
    const source = screen.getByLabelText('sourceLabel');
    await user.type(source, 'Dinner 50 USD');
    await user.click(screen.getByRole('button', { name: 'createDraft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('errors.RATE_LIMITED');
    expect(source).toHaveValue('Dinner 50 USD');
    await user.click(screen.getByRole('tab', { name: 'modes.manual' }));
    expect(screen.getByText('manualHint')).toBeInTheDocument();
  });
});
