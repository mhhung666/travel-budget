import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import { expectNoSeriousAxeViolations } from '@/test/axe';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import en from '@/i18n/messages/en.json';
import jp from '@/i18n/messages/jp.json';

vi.unmock('next-intl');
const h = vi.hoisted(() => ({
  desktop: true,
  online: true,
  read: vi.fn(),
  confirm: vi.fn(),
  add: vi.fn(),
  close: vi.fn(),
  success: vi.fn(),
  friends: [] as { user: { id: string; display_name: string; avatar_url: null } }[],
}));
vi.mock('@/actions', () => ({ getLedgerCapabilities: h.read, addFriendsToTrip: h.add }));
vi.mock('@/lib/confirmedWebWrites', () => ({ confirmWebWrite: h.confirm }));
vi.mock('@/lib/productEvents', () => ({ trackProductEvent: vi.fn() }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => h.desktop }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
vi.mock('@/hooks/queries', () => ({
  useFriends: () => ({
    data: { friends: h.friends },
    isPending: false,
    isError: false,
    isFetching: false,
    fetchStatus: 'idle',
  }),
}));

const key = ['ledgerCapabilities'];
const capabilities = (enabled = true, codes = ['TWD', 'USD', 'JPY', 'AED']) => ({
  ledgerContractVersion: 2 as const,
  moneyScale: 2 as const,
  nonTwdCreationEnabled: enabled,
  supportedBaseCurrencies: codes,
});
const success = (enabled = true, codes?: string[]) => ({
  success: true,
  data: capabilities(enabled, codes),
});
const catalogs = { zh, 'zh-CN': cn, en, jp };
let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.clearAllMocks();
  h.desktop = true;
  h.online = true;
  h.friends = [];
  h.read.mockResolvedValue(success());
  h.add.mockResolvedValue({ success: true });
  h.confirm.mockResolvedValue({ id: '65a000000000000000000001' });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open create</button>
      <CreateTripDialog
        open={open}
        onClose={() => {
          h.close();
          setOpen(false);
        }}
        onSuccess={h.success}
      />
    </>
  );
}
function mount(locale: keyof typeof catalogs = 'en') {
  const ui = () => (
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]} timeZone="Asia/Taipei">
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
  const result = render(ui());
  return { ...result, update: () => result.rerender(ui()) };
}
const name = () => screen.getByRole('textbox', { name: en.trips.create.name });
const field = () => document.getElementById('trip-base')!;
const form = () => document.getElementById('create-trip-form')!;
const create = () => screen.getByRole('button', { name: en.common.create });
const option = (code: string) => screen.getByRole('option', { name: new RegExp(`^${code} `) });
const ready = () => waitFor(() => expect(create()).toBeEnabled());
async function choose(code: string) {
  const user = userEvent.setup();
  await user.click(field());
  await user.type(screen.getByRole('combobox', { name: en.currencyPicker.creation.title }), code);
  await user.click(option(code));
  await waitFor(() => expect(field()).toHaveTextContent(code));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('keeps TWD and editable name while loading, and guards both button and form submission', async () => {
  const pending = deferred<ReturnType<typeof success>>();
  h.read.mockReturnValue(pending.promise);
  mount();
  await userEvent.setup().type(name(), 'Kyoto');
  expect(field()).toHaveTextContent('TWD · New Taiwan Dollar');
  expect(field()).toBeDisabled();
  expect(create()).toBeDisabled();
  expect(screen.getByText(en.currencyPicker.creation.loading)).toBeVisible();
  expect(screen.queryByText(/Currently only/)).toBeNull();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  await act(async () => pending.resolve(success()));
  await ready();
  expect(name()).toHaveValue('Kyoto');
});

it('a closed gate shows a readonly TWD value, an immutable rule and no useless picker', async () => {
  h.read.mockResolvedValue(success(false));
  mount();
  await ready();
  expect(field()).toHaveAttribute('role', 'group');
  expect(field()).not.toHaveAttribute('aria-haspopup');
  expect(field()).toHaveTextContent('TWD · New Taiwan Dollar');
  expect(screen.getByText('Currently only TWD · New Taiwan Dollar is available')).toBeVisible();
  expect(screen.getByText(en.currencyPicker.creation.description)).toBeVisible();
  expect(screen.queryByRole('listbox')).toBeNull();
  await userEvent.setup().type(name(), 'Trip');
  await userEvent.setup().click(create());
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.confirm.mock.calls[0][1].body.base_currency).toBe('TWD');
});

it('uses backend candidates without an Intl inventory, after name and before optional fields', async () => {
  vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
    throw new Error('No inventory');
  });
  h.read.mockResolvedValue(success(true, ['BHD', 'USD', 'TWD', 'USD']));
  mount();
  await ready();
  expect(name().compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(field().getAttribute('aria-describedby')).toContain('trip-base-help');
  await userEvent.setup().click(field());
  expect(screen.getAllByRole('option').map((row) => row.textContent?.slice(0, 3))).toEqual([
    'TWD',
    'USD',
    'BHD',
  ]);
  expect(document.getElementById('name')).toBeDisabled();
  expect(document.querySelector('button[form="create-trip-form"]')).toBeDisabled();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
});

it('only a currency change is retained as a draft; clear resets it to TWD', async () => {
  const user = userEvent.setup();
  mount();
  await ready();
  await choose('USD');
  await user.click(screen.getByRole('button', { name: en.common.close }));
  await user.click(screen.getByRole('button', { name: 'Open create' }));
  await ready();
  expect(field()).toHaveTextContent('USD · US Dollar');
  expect(screen.getByText(en.trips.create.draftRetained)).toBeVisible();
  await user.click(screen.getByRole('button', { name: en.trips.create.clearDraft }));
  expect(field()).toHaveTextContent('TWD · New Taiwan Dollar');
  expect(screen.queryByText(en.trips.create.draftRetained)).toBeNull();
});

it('searching then cancelling does not count as a modified draft or close the create form', async () => {
  const user = userEvent.setup();
  mount();
  await ready();
  await user.click(field());
  await user.type(screen.getByRole('combobox', { name: en.currencyPicker.creation.title }), 'usd');
  const picker = screen.getByRole('dialog', { name: en.currencyPicker.creation.title });
  await user.click(within(picker).getByRole('button', { name: en.common.cancel }));
  expect(h.close).not.toHaveBeenCalled();
  await waitFor(() => expect(field()).toHaveFocus());
  await user.click(screen.getByRole('button', { name: en.common.close }));
  await user.click(screen.getByRole('button', { name: 'Open create' }));
  await ready();
  expect(screen.queryByText(en.trips.create.draftRetained)).toBeNull();
  expect(field()).toHaveTextContent('TWD');
});

it('failed capabilities retain input and offer an adjacent retry without permitting a write', async () => {
  h.read.mockResolvedValueOnce({ success: false, error: 'Failed' }).mockResolvedValue(success());
  mount();
  await userEvent.setup().type(name(), 'Retained name');
  await waitFor(() =>
    expect(screen.getByText(en.currencyPicker.creation.unavailable)).toBeVisible()
  );
  expect(create()).toBeDisabled();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: en.common.retry }));
  await ready();
  expect(name()).toHaveValue('Retained name');
  expect(h.read).toHaveBeenCalledTimes(2);
});

it('background refresh preserves selected currency and input, blocks submission and does not steal focus', async () => {
  mount();
  await ready();
  await choose('USD');
  await userEvent.setup().type(name(), 'Trip');
  const pending = deferred<ReturnType<typeof success>>();
  h.read.mockReturnValueOnce(pending.promise);
  await act(async () => {
    void client.invalidateQueries({ queryKey: key });
  });
  await waitFor(() => expect(create()).toBeDisabled());
  expect(field()).toHaveTextContent('USD');
  expect(name()).toHaveFocus();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  await act(async () => pending.resolve(success()));
  await ready();
  expect(name()).toHaveValue('Trip');
  expect(field()).toHaveTextContent('USD');
  expect(name()).toHaveFocus();
});

it('background failure retains the last candidates and selected value, but cannot submit stale capabilities', async () => {
  mount();
  await ready();
  await choose('USD');
  h.read.mockResolvedValueOnce({ success: false, error: 'Refresh failed' });
  await act(async () => {
    await client.invalidateQueries({ queryKey: key });
  });
  await waitFor(() => expect(create()).toBeDisabled());
  expect(field()).toHaveTextContent('USD');
  expect(screen.getByText(en.currencyPicker.creation.unavailable)).toBeVisible();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  await userEvent.setup().click(field());
  expect(option('USD')).toHaveAttribute('aria-selected', 'true');
});

it('revocation does not reset USD and a latest-cache submit guard blocks before React has rerendered', async () => {
  mount();
  await ready();
  await choose('USD');
  await userEvent.setup().type(name(), 'Trip');
  act(() => {
    client.setQueryData(key, capabilities(false));
    fireEvent.submit(form());
  });
  expect(h.confirm).not.toHaveBeenCalled();
  await waitFor(() => expect(field()).toHaveAttribute('aria-invalid', 'true'));
  expect(field()).toHaveTextContent('USD');
  expect(screen.getByRole('alert')).toHaveTextContent('You cannot currently create a trip in USD');
  expect(create()).toBeDisabled();
  await choose('TWD');
  await ready();
  await waitFor(() => expect(field()).toHaveFocus());
  expect(field()).toHaveAttribute('role', 'group');
});

it('an empty capability set never injects TWD as an allowed default', async () => {
  h.read.mockResolvedValue(success(false, []));
  mount();
  await waitFor(() =>
    expect(screen.getByText(en.currencyPicker.creation.unavailable)).toBeVisible()
  );
  expect(field()).toHaveTextContent('TWD');
  expect(field()).toBeDisabled();
  expect(create()).toBeDisabled();
  expect(screen.queryByText(/Currently only/)).toBeNull();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
});

it('a capability update inside the open picker keeps search focus and requires an explicit new selection', async () => {
  mount();
  await ready();
  await choose('USD');
  await userEvent.setup().click(field());
  const input = screen.getByRole('combobox', { name: en.currencyPicker.creation.title });
  expect(input).toHaveFocus();
  act(() => {
    client.setQueryData(key, capabilities(false));
  });
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
  expect(input).toHaveFocus();
  expect(option('TWD')).toHaveAttribute('aria-selected', 'false');
  expect(field()).toHaveTextContent('USD');
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  await userEvent.setup().click(option('TWD'));
  await ready();
  expect(field()).toHaveTextContent('TWD');
  await waitFor(() => expect(field()).toHaveFocus());
});

it('selecting the existing default closes without creating an unsaved draft', async () => {
  const user = userEvent.setup();
  mount();
  await ready();
  await choose('TWD');
  await user.click(screen.getByRole('button', { name: en.common.close }));
  await user.click(screen.getByRole('button', { name: 'Open create' }));
  await ready();
  expect(screen.queryByText(en.trips.create.draftRetained)).toBeNull();
});

it('offline startup blocks writes, keeps fields editable, and reads capabilities after reconnecting', async () => {
  h.online = false;
  const view = mount();
  await userEvent.setup().type(name(), 'Offline input');
  expect(h.read).not.toHaveBeenCalled();
  expect(create()).toBeDisabled();
  expect(screen.getByText(en.currencyPicker.creation.offline)).toBeVisible();
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
  h.online = true;
  view.update();
  await ready();
  expect(name()).toHaveValue('Offline input');
});

it('the synchronous connectivity guard blocks an offline click before the online hook updates', async () => {
  mount();
  await ready();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  fireEvent.submit(form());
  expect(h.confirm).not.toHaveBeenCalled();
});

it('synchronous duplicate submissions capture one body and freeze every input until completion', async () => {
  const pending = deferred<{ id: string }>();
  h.confirm.mockReturnValue(pending.promise);
  h.friends = [
    { user: { id: '65a000000000000000000003', display_name: 'Alice', avatar_url: null } },
  ];
  mount();
  await ready();
  await choose('USD');
  const user = userEvent.setup();
  await user.type(name(), 'Original name');
  await user.click(screen.getByRole('button', { name: en.trips.create.moreDetailsWithFriends }));
  await user.type(
    screen.getByRole('textbox', { name: en.trips.create.description }),
    'Original description'
  );
  await user.click(screen.getByRole('checkbox'));
  fireEvent.change(document.getElementById('start_date')!, { target: { value: '2026-10-01' } });
  act(() => {
    fireEvent.submit(form());
    fireEvent.submit(form());
  });
  expect(h.confirm).toHaveBeenCalledOnce();
  expect(name()).toBeDisabled();
  expect(field()).toBeDisabled();
  expect(document.getElementById('description')).toBeDisabled();
  expect(document.getElementById('start_date')).toBeDisabled();
  expect(document.getElementById('end_date')).toBeDisabled();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('combobox', { name: en.trips.create.destination })).toBeDisabled();
  expect(screen.getByRole('button', { name: en.currencyPicker.creation.creating })).toBeDisabled();
  fireEvent.change(name(), { target: { value: 'Changed name' } });
  expect(name()).toHaveValue('Original name');
  await user.click(screen.getByRole('button', { name: en.common.close }));
  expect(h.close).not.toHaveBeenCalled();
  expect(h.confirm.mock.calls[0][1].body).toMatchObject({
    base_currency: 'USD',
    name: 'Original name',
    description: 'Original description',
    start_date: '2026-10-01',
    end_date: null,
  });
  expect(h.confirm.mock.calls[0][1].body.client_request_id).toMatch(/^[0-9a-f-]{36}$/);
  await act(async () => pending.resolve({ id: '65a000000000000000000001' }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.add).toHaveBeenCalledExactlyOnceWith('65a000000000000000000001', {
    friend_ids: ['65a000000000000000000003'],
  });
});

it.each(['cancel', 'Escape'] as const)(
  'narrow %s returns from one sheet without losing name, scroll or chosen value',
  async (action) => {
    h.desktop = false;
    mount();
    await ready();
    const user = userEvent.setup();
    await user.type(name(), 'Keep me');
    const body = form().parentElement!;
    body.scrollTop = 180;
    fireEvent.scroll(body);
    await user.click(field());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(form().parentElement).toHaveAttribute('hidden');
    expect(form().parentElement).toHaveAttribute('inert');
    expect(screen.queryByRole('button', { name: en.common.create })).toBeNull();
    expect(
      screen
        .getAllByRole('heading', { name: en.currencyPicker.creation.title })
        .some((heading) => heading === document.activeElement)
    ).toBe(true);
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveFocus();
    await user.click(input);
    await user.type(input, 'USD');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeVisible();
    expect(h.confirm).not.toHaveBeenCalled();
    if (action === 'cancel')
      await user.click(screen.getByRole('button', { name: en.common.cancel }));
    else await user.keyboard('{Escape}');
    expect(h.close).not.toHaveBeenCalled();
    expect(name()).toHaveValue('Keep me');
    expect(field()).toHaveTextContent('TWD');
    expect(body.scrollTop).toBe(180);
    await waitFor(() => expect(field()).toHaveFocus());
  }
);

it('narrow selection closes on the first click and changing breakpoints preserves form and selected currency', async () => {
  h.desktop = false;
  const view = mount();
  await ready();
  await userEvent.setup().type(name(), 'Responsive');
  await choose('USD');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(field()).toHaveFocus());
  await userEvent.setup().click(field());
  h.desktop = true;
  view.update();
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: en.currencyPicker.creation.title })).toHaveFocus()
  );
  await userEvent.setup().keyboard('{Escape}');
  expect(name()).toHaveValue('Responsive');
  expect(field()).toHaveTextContent('USD');
  h.desktop = false;
  view.update();
  expect(name()).toHaveValue('Responsive');
  expect(field()).toHaveTextContent('USD');
});

it.each(Object.entries(catalogs))(
  'uses the %s creation rules and passes automated accessibility checks',
  async (locale, messages) => {
    h.read.mockResolvedValue(success(false));
    mount(locale as keyof typeof catalogs);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: messages.common.create })).toBeEnabled()
    );
    expect(field()).toHaveTextContent(`TWD · ${messages.currencyPicker.names.TWD}`);
    expect(screen.getByText(messages.currencyPicker.creation.description)).toBeVisible();
    await expectNoSeriousAxeViolations(document.body);
  }
);
