import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { lazyDialog } from '@/components/common/lazyDialog';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }));

afterEach(cleanup);

function Form({ open }: { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  return open ? (
    <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
  ) : null;
}

it('does not import or mount until open, and preserves the existing draft on reopen', async () => {
  const loader = vi.fn(async () => ({ default: Form }));
  const View = lazyDialog(loader);
  const close = vi.fn();
  const view = render(<View open={false} onClose={close} />);
  expect(loader).not.toHaveBeenCalled();
  view.rerender(<View open onClose={close} />);
  fireEvent.change(await screen.findByLabelText('draft'), { target: { value: 'my draft' } });
  view.rerender(<View open={false} onClose={close} />);
  expect(screen.queryByLabelText('draft')).not.toBeInTheDocument();
  view.rerender(<View open onClose={close} />);
  expect(screen.getByLabelText('draft')).toHaveValue('my draft');
  expect(loader).toHaveBeenCalledOnce();
});

it('can dismiss a pending import, does not reopen on resolution, and reuses it on reopen', async () => {
  let resolve!: (value: { default: typeof Form }) => void;
  const loader = vi.fn(
    () =>
      new Promise<{ default: typeof Form }>((done) => {
        resolve = done;
      })
  );
  const View = lazyDialog(loader);
  const close = vi.fn();
  const view = render(<View open onClose={close} />);
  expect(screen.getByRole('status')).toHaveTextContent('loading');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  view.rerender(<View open={false} onClose={close} />);
  await act(async () => resolve({ default: Form }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('draft')).not.toBeInTheDocument();
  view.rerender(<View open onClose={close} />);
  expect(await screen.findByLabelText('draft')).toBeInTheDocument();
  expect(loader).toHaveBeenCalledOnce();
});

it('contains import failures, retries a fresh loader and remains dismissible', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const loader = vi
      .fn<() => Promise<{ default: typeof Form }>>()
      .mockRejectedValueOnce(new Error('private chunk URL'))
      .mockResolvedValueOnce({ default: Form });
    const View = lazyDialog(loader);
    const close = vi.fn();
    render(<View open onClose={close} />);
    const retry = await screen.findByRole('button', { name: 'retry' });
    expect(screen.queryByText('private chunk URL')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByLabelText('draft')).toBeInTheDocument());
    expect(loader).toHaveBeenCalledTimes(2);
  } finally {
    log.mockRestore();
  }
});
