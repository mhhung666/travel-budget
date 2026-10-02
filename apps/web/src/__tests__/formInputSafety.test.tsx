import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePrecisionInput } from '@/components/collections/RecordFormFields';
import { NoteComposer } from '@/components/trips/detail/notes/NoteComposer';
import { TagInput } from '@/components/ui/tag-input';
import ChecklistCard from '@/components/trips/detail/checklist/ChecklistCard';
import { SecuritySection } from '@/components/settings/SecuritySection';
import type { Checklist } from '@/types';

vi.mock('@/actions', () => ({ createNoteUploadUrl: vi.fn(), updateProfile: vi.fn() }));
vi.mock('@/hooks/queries', () => ({ useTrips: () => ({ data: [] }) }));
vi.mock('@/components/trips/detail/ReceiptAttachments', () => ({
  NoteThumb: ({ attachment }: { attachment: { key: string } }) => <span>{attachment.key}</span>,
}));
vi.mock('@/lib/attachmentUpload', () => ({
  uploadAttachmentFiles: vi.fn(async () => ({ added: [{ key: 'draft-image' }] })),
}));
vi.mock('@/components/trips/detail/checklist/ChecklistItemRow', () => ({ default: () => null }));
afterEach(cleanup);

function YearForm() {
  const [date, setDate] = useState('2026-01-01');
  return (
    <>
      <DatePrecisionInput
        id="year"
        date={date}
        precision="year"
        onDateChange={setDate}
        onPrecisionChange={() => {}}
      />
      <output data-testid="date">{date}</output>
      <button onClick={() => setDate('2020-01-01')}>Reset date</button>
    </>
  );
}

describe('form input recovery', () => {
  it('accepts typing, replacing, deleting and pasting a year without committing an incomplete date', async () => {
    const user = userEvent.setup();
    render(<YearForm />);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '20');
    expect(input).toHaveValue(20);
    expect(screen.getByTestId('date')).toHaveTextContent('');
    await user.type(input, '18');
    expect(screen.getByTestId('date')).toHaveTextContent('2018-01-01');
    await user.keyboard('{Backspace}');
    expect(input).toHaveValue(201);
    await user.type(input, '9');
    expect(screen.getByTestId('date')).toHaveTextContent('2019-01-01');
    fireEvent.change(input, { target: { value: '1800' } });
    fireEvent.blur(input);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('common.yearInvalid');
    fireEvent.change(input, { target: { value: '2001' } });
    expect(screen.getByTestId('date')).toHaveTextContent('2001-01-01');
    await user.click(screen.getByRole('button', { name: 'Reset date' }));
    expect(input).toHaveValue(2020);
  });

  it('retains text and attachments on failure, blocks duplicate submission and clears only after success', async () => {
    let finish!: (success: boolean) => void;
    const submit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    const { container } = render(<NoteComposer tripId="trip" onSubmit={submit} pending={false} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Keep my draft' } });
    fireEvent.change(container.querySelector('input[type=file]')!, {
      target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    });
    await screen.findByText('draft-image');
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    await act(async () => finish(false));
    expect(input).toHaveValue('Keep my draft');
    expect(screen.getByText('draft-image')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'send' }));
    expect(submit).toHaveBeenCalledTimes(2);
    await act(async () => finish(true));
    expect(input).toHaveValue('');
    expect(screen.queryByText('draft-image')).toBeNull();
  });

  it('does not submit a note while IME is composing, including the Safari 229 fallback', () => {
    const submit = vi.fn(async () => false);
    render(<NoteComposer tripId="trip" onSubmit={submit} pending={false} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '中文選字' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(submit).not.toHaveBeenCalled();
    expect(input).toHaveValue('中文選字');
  });

  it('does not commit a tag or checklist item during composition', () => {
    const tags = vi.fn();
    const add = vi.fn();
    const { unmount } = render(<TagInput value={[]} onChange={tags} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '餐飲' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true });
    expect(tags).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(tags).toHaveBeenCalledWith(['餐飲']);
    unmount();
    render(
      <ChecklistCard
        checklist={{ id: 'list', title: 'List', kind: 'todo', items: [] } as unknown as Checklist}
        members={[]}
        currentUserId={null}
        canEdit
        onAddItem={add}
        onToggleItem={vi.fn()}
        onAssignItem={vi.fn()}
        onRemoveItem={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const input = screen.getByRole('textbox', { name: 'itemPlaceholder' });
    fireEvent.change(input, { target: { value: '護照' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(add).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(add).toHaveBeenCalledWith('護照');
  });

  it('focuses and describes the confirmation field when passwords do not match', async () => {
    render(<SecuritySection />);
    fireEvent.change(screen.getByLabelText('password.current'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('password.new'), { target: { value: 'new-password' } });
    const confirm = screen.getByLabelText('password.confirm');
    fireEvent.change(confirm, { target: { value: 'other-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'password.updateButton' }));
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(confirm).toHaveAccessibleDescription('password.mismatch');
    fireEvent.change(confirm, { target: { value: 'new-password' } });
    await waitFor(() => expect(confirm).toHaveAttribute('aria-invalid', 'false'));
  });
});
