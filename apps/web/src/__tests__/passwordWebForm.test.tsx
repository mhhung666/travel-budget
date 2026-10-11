import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/actions', () => ({ updateProfile: h.update }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
import { SecuritySection } from '@/components/settings/SecuritySection';
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function fill(password = 'new password') {
  fireEvent.change(screen.getByLabelText('password.current'), {
    target: { value: ' old password ' },
  });
  fireEvent.change(screen.getByLabelText('password.new'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('password.confirm'), { target: { value: password } });
}
const submit = () => fireEvent.submit(screen.getByLabelText('password.current').closest('form')!);
it('prevents double submit and clears secrets after success, requiring a new login', async () => {
  let finish!: (r: unknown) => void;
  h.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(<SecuritySection />);
  fill();
  submit();
  submit();
  expect(h.update).toHaveBeenCalledExactlyOnceWith({
    current_password: ' old password ',
    new_password: 'new password',
  });
  finish({ success: true, data: { message: 'OK' } });
  expect(await screen.findByText('password.reauthenticate')).toBeInTheDocument();
  expect(screen.getByLabelText('password.current')).toHaveValue('');
  expect(screen.getByLabelText('password.new')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'password.login' })).toBeInTheDocument();
});
it('validates UTF-8 before a request', () => {
  render(<SecuritySection />);
  fill('中'.repeat(25));
  submit();
  expect(h.update).not.toHaveBeenCalled();
  expect(screen.getByLabelText('password.new')).toHaveAttribute('aria-invalid', 'true');
});
it('uncertain replies lock the form and never resend, with an explanation instead of server payloads', async () => {
  h.update.mockRejectedValue(new Error('private response details'));
  render(<SecuritySection />);
  fill();
  submit();
  expect(await screen.findByText('password.unknown')).toBeInTheDocument();
  submit();
  expect(h.update).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('password.current')).toHaveValue('');
  expect(screen.queryByText('private response details')).not.toBeInTheDocument();
});
it('wrong password permits correction; rate limit cannot be bypassed by clicking again', async () => {
  h.update.mockResolvedValueOnce({
    success: false,
    code: 'VALIDATION_ERROR',
    error: 'INVALID_CURRENT_PASSWORD',
  });
  render(<SecuritySection />);
  fill();
  submit();
  expect(await screen.findByText('password.currentInvalid')).toBeInTheDocument();
  h.update.mockResolvedValueOnce({
    success: false,
    code: 'RATE_LIMITED',
    error: 'RATE_LIMITED',
    retryAfter: 120,
  });
  fill();
  submit();
  expect(await screen.findByText('password.rateLimited')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('password.current')).toHaveValue(''));
  fill();
  submit();
  expect(h.update).toHaveBeenCalledTimes(2);
});
