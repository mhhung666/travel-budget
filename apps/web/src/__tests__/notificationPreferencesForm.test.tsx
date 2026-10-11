import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
const h = vi.hoisted(() => ({ read: vi.fn(), update: vi.fn() }));
vi.mock('@/actions', () => ({
  getNotificationPrefs: h.read,
  updateNotificationPrefs: h.update,
  getPushSubscriptions: vi.fn(),
  deletePushSubscription: vi.fn(),
}));
const translate = (key: string) => key;
vi.mock('next-intl', () => ({ useLocale: () => 'zh', useTranslations: () => translate }));
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({ supported: false, configured: false }),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: PropsWithChildren<{
    value: string;
    disabled: boolean;
    onValueChange: (v: string) => void;
  }>) => (
    <select
      aria-label="notification-language"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: PropsWithChildren) => <>{children}</>,
  SelectItem: ({ children, value }: PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
import { NotificationsSection } from '@/components/settings/NotificationsSection';
const initial = { notifyByEmail: true, locale: 'jp' };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}
beforeEach(() => {
  vi.resetAllMocks();
  h.read.mockResolvedValue({ success: true, data: initial });
  h.update.mockResolvedValue({
    success: true,
    data: { notifyByEmail: false, locale: 'jp', message: 'OK' },
  });
});
afterEach(cleanup);
it('shows stored language, switch saves do not overwrite it with UI language, and language can be saved independently', async () => {
  render(<NotificationsSection />);
  const toggle = screen.getByRole('checkbox', { name: /notifications.emailLabel/ });
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(screen.getByLabelText('notification-language')).toHaveValue('jp');
  fireEvent.click(toggle);
  await screen.findByText('notifications.updateSuccess');
  expect(h.update).toHaveBeenCalledWith({ notify_by_email: false });
  h.update.mockResolvedValue({
    success: true,
    data: { notifyByEmail: false, locale: 'en', message: 'OK' },
  });
  fireEvent.change(screen.getByLabelText('notification-language'), { target: { value: 'en' } });
  await waitFor(() => expect(h.update).toHaveBeenCalledWith({ locale: 'en' }));
  expect(h.update).toHaveBeenCalledTimes(2);
});
it('failed initial reads disable all preference writes and offer retry without displaying fake saved settings', async () => {
  h.read.mockResolvedValue({ success: false, code: 'INTERNAL_ERROR' });
  render(<NotificationsSection />);
  await screen.findByText('errors.updateFailed');
  expect(screen.getByRole('checkbox', { name: /notifications.emailLabel/ })).toBeDisabled();
  expect(screen.getByLabelText('notification-language')).toBeDisabled();
  expect(h.update).not.toHaveBeenCalled();
  h.read.mockResolvedValue({ success: true, data: initial });
  fireEvent.click(screen.getByRole('button', { name: 'notifications.refresh' }));
  await waitFor(() => expect(screen.getByLabelText('notification-language')).toHaveValue('jp'));
});
it('blocks duplicate writes, freezes unknown outcomes, and requires a successful read to resume editing', async () => {
  const response = deferred<{ success: false; code: 'INTERNAL_ERROR'; error: string }>();
  h.update.mockReturnValue(response.promise);
  render(<NotificationsSection />);
  const toggle = screen.getByRole('checkbox', { name: /notifications.emailLabel/ });
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(h.update).toHaveBeenCalledOnce();
  await act(async () => {
    response.resolve({ success: false, code: 'INTERNAL_ERROR', error: 'unknown' });
  });
  expect(toggle).toBeDisabled();
  expect(screen.getByText('notifications.unknown')).toBeInTheDocument();
  h.read.mockResolvedValue({ success: false, code: 'INTERNAL_ERROR' });
  fireEvent.click(screen.getByRole('button', { name: 'notifications.checkCurrent' }));
  await screen.findByText('errors.updateFailed');
  expect(toggle).toBeDisabled();
  h.read.mockResolvedValue({ success: true, data: { notifyByEmail: false, locale: 'en' } });
  fireEvent.click(screen.getByRole('button', { name: 'notifications.checkCurrent' }));
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).not.toBeChecked();
  expect(screen.getByLabelText('notification-language')).toHaveValue('en');
  expect(screen.queryByText('notifications.updateSuccess')).toBeNull();
  expect(h.update).toHaveBeenCalledOnce();
});
it('does not let an old mounted screen response replace settings after remount', async () => {
  const late = deferred<unknown>();
  h.read.mockReturnValueOnce(late.promise);
  const first = render(<NotificationsSection />);
  await waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  first.unmount();
  h.read.mockResolvedValue({ success: true, data: { notifyByEmail: false, locale: 'en' } });
  render(<NotificationsSection />);
  await waitFor(() => expect(screen.getByLabelText('notification-language')).toHaveValue('en'));
  await act(async () => {
    late.resolve({ success: true, data: initial });
  });
  expect(screen.getByLabelText('notification-language')).toHaveValue('en');
});
