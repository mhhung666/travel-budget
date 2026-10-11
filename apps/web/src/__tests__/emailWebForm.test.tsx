import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ send: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), read: vi.fn() }));
vi.mock('@/actions', () => ({
  requestEmailChange: h.send,
  confirmEmailChange: h.confirm,
  cancelEmailChange: h.cancel,
  getCurrentUser: h.read,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));
import { EmailChangeSection } from '@/components/settings/EmailChangeSection';
beforeEach(() => {
  vi.resetAllMocks();
  h.send.mockResolvedValue({ success: true, data: { message: 'OK' } });
  h.confirm.mockResolvedValue({ success: true, data: { email: 'new@example.com' } });
  h.cancel.mockResolvedValue({ success: true, data: { message: 'OK' } });
});
afterEach(cleanup);
const fill = () =>
  fireEvent.change(screen.getByLabelText('email.title'), { target: { value: 'NEW@example.com' } });
it('double clicking sends once; target-bound confirmation uses server email then clears code', async () => {
  const changed = vi.fn();
  let finish!: (result: unknown) => void;
  h.send.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      })
  );
  render(<EmailChangeSection currentEmail="old@example.com" onCurrent={changed} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'email.sendCode' }));
  fireEvent.click(screen.getByRole('button', { name: 'email.sendCode' }));
  expect(h.send).toHaveBeenCalledOnce();
  finish({ success: true, data: { message: 'OK' } });
  await screen.findByLabelText('email.code');
  fireEvent.change(screen.getByLabelText('email.code'), { target: { value: '012345' } });
  fireEvent.click(screen.getByRole('button', { name: 'email.verifyButton' }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith('new@example.com'));
  expect(h.confirm).toHaveBeenCalledWith({ new_email: 'new@example.com', code: '012345' });
});
it('send 429 does not lock a valid code; cancellation is server-side and cannot run during confirmation', async () => {
  h.send.mockResolvedValueOnce({
    success: false,
    code: 'RATE_LIMITED',
    error: 'RATE_LIMITED',
    retryAfter: 120,
  });
  render(<EmailChangeSection currentEmail="old@example.com" onCurrent={vi.fn()} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'email.sendCode' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'email.sendCode' })).toBeDisabled()
  );
  expect(screen.getByRole('button', { name: 'email.cancel' })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'email.cancel' }));
  await waitFor(() => expect(h.cancel).toHaveBeenCalledOnce());
});
it('unknown send freezes writes, displays no private exception; explicit profile read allows a user decision', async () => {
  h.send.mockRejectedValue(new Error('private code 123456'));
  h.read.mockResolvedValue({ success: true, data: { email: 'old@example.com' } });
  render(<EmailChangeSection currentEmail="old@example.com" onCurrent={vi.fn()} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'email.sendCode' }));
  await screen.findByText('email.unknown');
  expect(screen.getByLabelText('email.title')).toBeDisabled();
  expect(screen.queryByText('private code 123456')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'email.readCurrent' }));
  await screen.findByText('email.currentRead');
  expect(h.send).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('email.code')).toHaveValue('');
});
it('failed delivery displays the shared refusal and never marks a code as sent', async () => {
  h.send.mockResolvedValue({
    success: false,
    code: 'VALIDATION_ERROR',
    error: 'EMAIL_DELIVERY_FAILED',
  });
  render(<EmailChangeSection currentEmail="old@example.com" onCurrent={vi.fn()} />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'email.sendCode' }));
  await screen.findByText('email.deliveryFailed');
  expect(screen.queryByLabelText('email.code')).toBeNull();
  expect(screen.getByLabelText('email.title')).not.toBeDisabled();
});

it('a fresh empty form can explicitly cancel server codes after losing local form state', async () => {
  render(<EmailChangeSection currentEmail="old@example.com" onCurrent={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'email.cancel' }));
  await screen.findByText('email.cancelled');
  expect(h.cancel).toHaveBeenCalledOnce();
  expect(h.send).not.toHaveBeenCalled();
});
