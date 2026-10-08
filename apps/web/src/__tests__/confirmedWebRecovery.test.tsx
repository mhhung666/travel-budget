import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTranslator, type AbstractIntlMessages } from 'next-intl';
import en from '@/i18n/messages/en.json';
import zh from '@/i18n/messages/zh.json';
import zhCN from '@/i18n/messages/zh-CN.json';
import jp from '@/i18n/messages/jp.json';
import { ConfirmedWebRecovery } from '@/components/expenses/ConfirmedWebRecovery';
import type { ConfirmedWebEntry } from '@/lib/confirmedWebWrites';
import { ledgerErrorMessage } from '@/lib/ledgerErrorMessage';

const catalogs = { en, zh, 'zh-CN': zhCN, jp };
const h = vi.hoisted(() => ({
  locale: 'zh',
  entries: {} as Record<string, ConfirmedWebEntry>,
  resume: vi.fn(),
}));
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: 'ledger' | 'common') =>
      actual.createTranslator({
        locale: h.locale,
        messages: catalogs[h.locale as keyof typeof catalogs],
        namespace,
      }),
  };
});
vi.mock('@/lib/confirmedWebWrites', () => ({
  confirmedWebKey: ['confirmedWebWrites'],
  readConfirmedWebWrites: async () => h.entries,
  resumeConfirmedWebWrite: (...args: unknown[]) => h.resume(...args),
}));
const id = 'fa2858e1-43c0-4320-88a9-f64b79a2a233';
let client: QueryClient;
beforeEach(() => {
  h.locale = 'zh';
  h.resume.mockReset();
  h.entries = {
    [id]: {
      version: 2,
      status: 'pending',
      savedAt: 1,
      request: {
        operation: 'expense.update',
        tripId: 'a'.repeat(24),
        expenseId: 'b'.repeat(24),
        body: {
          client_request_id: id,
          base_currency: 'TWD',
          expected_revision: 'c'.repeat(64),
          description: 'Edited',
        },
      },
    },
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <ConfirmedWebRecovery />
    </QueryClientProvider>
  );
function reject(code: string, terminal = true) {
  h.resume.mockImplementationOnce(async () => {
    if (terminal) {
      h.entries = { [id]: { ...h.entries[id], status: 'rejected', error: code } };
      client.setQueryData(['confirmedWebWrites'], h.entries);
    }
    throw new Error(code);
  });
}
it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
  'keeps the translated %s rejection visible after pending entries disappear and lets the user acknowledge it',
  async (locale) => {
    h.locale = locale;
    reject('RESOURCE_GONE');
    const messages = catalogs[locale];
    const translatorMessages: AbstractIntlMessages = { ledger: messages.ledger };
    const t = createTranslator({ locale, messages: translatorMessages, namespace: 'ledger' });
    expect(ledgerErrorMessage('RESOURCE_GONE', t)).toBe(messages.ledger.RESOURCE_GONE);
    expect(ledgerErrorMessage('ledger.RESOURCE_GONE', t)).toBe(messages.ledger.RESOURCE_GONE);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: messages.ledger.recover }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(messages.ledger.writeRejected);
    expect(alert).toHaveTextContent(messages.ledger.RESOURCE_GONE);
    expect(alert).not.toHaveTextContent(messages.ledger.writeUnknown);
    expect(screen.queryByText(messages.ledger.pendingWrite)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: messages.ledger.recover })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: messages.common.close }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(h.entries[id].status).toBe('rejected');
    expect(h.resume).toHaveBeenCalledOnce();
  }
);
it('describes unknown terminal refusals as rejected, rather than as an unknown write', async () => {
  reject('VALIDATION_ERROR');
  mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: zh.ledger.recover }));
  expect(await screen.findByRole('alert')).toHaveTextContent(zh.ledger.writeRejected);
  expect(screen.getByRole('alert')).not.toHaveTextContent(zh.ledger.writeUnknown);
  expect(screen.getByRole('alert')).not.toHaveTextContent('VALIDATION_ERROR');
});
it('keeps ambiguous transport failures pending and recoverable after acknowledging the message', async () => {
  reject('response lost', false);
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: zh.ledger.recover }));
  expect(await screen.findByRole('alert')).toHaveTextContent(zh.ledger.writeUnknown);
  await user.click(screen.getByRole('button', { name: zh.common.close }));
  expect(h.entries[id].status).toBe('pending');
  expect(screen.getByRole('button', { name: zh.ledger.recover })).toBeEnabled();
});
it('does not retain a local error after the current journal is cleared or changes accounts', async () => {
  reject('RESOURCE_GONE');
  mount();
  await userEvent.setup().click(await screen.findByRole('button', { name: zh.ledger.recover }));
  await screen.findByRole('alert');
  act(() => {
    h.entries = {};
    client.setQueryData(['confirmedWebWrites'], h.entries);
  });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
