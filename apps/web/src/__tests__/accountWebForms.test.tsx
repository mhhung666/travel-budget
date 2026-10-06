import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  request: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('@/actions', () => ({
  register: mocks.register,
  login: mocks.login,
  requestPasswordReset: mocks.request,
  resetPassword: mocks.confirm,
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string, args?: Record<string, unknown>) =>
    key + (args ? JSON.stringify(args) : ''),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    Dialog: ({ children, open }: PropsWithChildren<{ open: boolean }>) =>
      open ? <div>{children}</div> : null,
    DialogContent: Box,
    DialogDescription: Box,
    DialogFooter: Box,
    DialogHeader: Box,
    DialogTitle: Box,
  };
});
import LoginForm from '@/components/login/LoginForm';
import ForgotPasswordModal from '@/components/login/ForgotPasswordModal';
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);
it('Web registration blocks a password beyond 72 UTF-8 bytes with localized help', () => {
  render(<LoginForm />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'register.registerButton' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'tester' } });
  fireEvent.change(screen.getByLabelText('register.displayName'), { target: { value: 'Name' } });
  fireEvent.change(screen.getByLabelText('register.email'), {
    target: { value: 'test@example.com' },
  });
  fireEvent.change(screen.getByLabelText('login.password'), { target: { value: '中'.repeat(25) } });
  fireEvent.submit(screen.getByLabelText('login.password').closest('form')!);
  expect(mocks.register).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('register.passwordHelp');
});
it('Web reset preserves leading-zero codes and blocks oversized new passwords before sending', async () => {
  mocks.request.mockResolvedValue({ success: true, data: { message: 'OK' } });
  render(<ForgotPasswordModal open onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('forgotPassword.email'), {
    target: { value: 'test@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('forgotPassword.email').closest('form')!);
  const code = await screen.findByLabelText('forgotPassword.code');
  fireEvent.change(code, { target: { value: '000007' } });
  fireEvent.change(screen.getByLabelText('forgotPassword.newPassword'), {
    target: { value: '中'.repeat(25) },
  });
  fireEvent.submit(code.closest('form')!);
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('register.passwordHelp');
  mocks.confirm.mockResolvedValue({
    success: false,
    error: 'INVALID_CODE',
    code: 'VALIDATION_ERROR',
  });
  fireEvent.change(screen.getByLabelText('forgotPassword.newPassword'), {
    target: { value: ' NewPass ' },
  });
  fireEvent.submit(code.closest('form')!);
  expect(mocks.confirm).toHaveBeenCalledWith({
    email: 'test@example.com',
    code: '000007',
    new_password: ' NewPass ',
  });
  expect(await screen.findByText('forgotPassword.invalidCode')).toBeInTheDocument();
});
it('Web reset request displays shared limit seconds instead of the raw error token', async () => {
  mocks.request.mockResolvedValue({
    success: false,
    error: 'RATE_LIMITED',
    code: 'RATE_LIMITED',
    retryAfter: 57,
  });
  render(<ForgotPasswordModal open onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('forgotPassword.email'), {
    target: { value: 'test@example.com' },
  });
  fireEvent.submit(screen.getByLabelText('forgotPassword.email').closest('form')!);
  expect(await screen.findByText('forgotPassword.rateLimited{"seconds":57}')).toBeInTheDocument();
});
