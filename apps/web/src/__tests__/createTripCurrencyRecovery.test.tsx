import { useState } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CreateTripDialog from '@/components/trips/CreateTripDialog';
import {
  bindConfirmedWebWrites,
  captureConfirmedWebScope,
  stopConfirmedWebWrites,
  readConfirmedWebWrites,
  resumeConfirmedWebWrite,
} from '@/lib/confirmedWebWrites';
import { ConfirmedWebRecovery } from '@/components/expenses/ConfirmedWebRecovery';
import zh from '@/i18n/messages/zh.json';
import cn from '@/i18n/messages/zh-CN.json';
import en from '@/i18n/messages/en.json';
import jp from '@/i18n/messages/jp.json';

vi.unmock('next-intl');
const h = vi.hoisted(() => ({
  desktop: true,
  online: true,
  read: vi.fn(),
  write: vi.fn(),
  lookup: vi.fn(),
  save: vi.fn(),
  storage: new Map<string, unknown>(),
  localError: null as Error | null,
  add: vi.fn(),
  close: vi.fn(),
  success: vi.fn(),
  friends: [] as { user: { id: string; display_name: string; avatar_url: null } }[],
}));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => {
    if (h.localError) throw h.localError;
    return structuredClone(h.storage.get(key));
  },
  update: async (key: string, fn: (old: unknown) => unknown) => {
    await h.save();
    h.storage.set(key, structuredClone(fn(h.storage.get(key))));
  },
}));
vi.mock('@/actions', () => ({
  getLedgerCapabilities: h.read,
  addFriendsToTrip: h.add,
  getLedgerMutation: h.lookup,
  createLedgerTrip: h.write,
  joinLedgerTrip: h.write,
  writeWebTripSettings: h.write,
  writeWebPayment: h.write,
  updateLedgerExpense: h.write,
  deleteLedgerExpense: h.write,
}));
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
let updateView: () => void;
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
  h.storage.clear();
  h.localError = null;
  h.save.mockResolvedValue(undefined);
  h.lookup.mockResolvedValue({ success: true, data: { status: 'not_found' } });
  h.read.mockResolvedValue(success());
  h.add.mockResolvedValue({ success: true });
  h.write.mockResolvedValue({ success: true, data: { id: '65a000000000000000000001' } });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  bindConfirmedWebWrites(client, 'bc1c:actor');
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
      <ConfirmedWebRecovery />
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
  updateView = () => result.rerender(ui());
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

const tripId = '65a000000000000000000001';
async function pendingRecord() {
  const journal = await readConfirmedWebWrites(client);
  const entry = Object.values(journal).find((entry) => entry.status === 'pending')!;
  expect(entry).toBeDefined();
  return entry;
}
async function loseResponse(code = 'USD') {
  h.write.mockRejectedValueOnce(new TypeError('Lost response'));
  mount();
  await ready();
  await choose(code);
  await userEvent.setup().type(name(), 'Confirmed trip');
  await userEvent.setup().click(create());
  await waitFor(() => expect(name()).toBeDisabled());
  return pendingRecord();
}
function receipt(currency: string) {
  return {
    success: true,
    data: {
      status: 'committed',
      operation: 'trip.create',
      ledger: { baseCurrency: currency, moneyScale: 2 },
      result: { tripId },
    },
  };
}

it('a failed initial save keeps editable input and never performs a lookup or creation', async () => {
  mount();
  await ready();
  await choose('USD');
  await userEvent.setup().type(name(), 'Keep this input');
  h.save.mockRejectedValueOnce(new Error('Quota'));
  await userEvent.setup().click(create());
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      en.currencyPicker.creation.preparationFailed
    )
  );
  expect(name()).toBeEnabled();
  expect(name()).toHaveValue('Keep this input');
  expect(field()).toHaveTextContent('USD');
  expect(h.lookup).not.toHaveBeenCalled();
  expect(h.write).not.toHaveBeenCalled();
  expect(await readConfirmedWebWrites(client)).toEqual({});
  await choose('JPY');
  await userEvent.setup().click(create());
  await waitFor(() => expect(h.success).toHaveBeenCalledExactlyOnceWith({ id: tripId }));
  expect(h.write.mock.calls[0][0].base_currency).toBe('JPY');
});

it.each(['TWD', 'USD', 'JPY'])(
  'lost %s response freezes the original body and queries the same UUID despite withdrawn capabilities',
  async (currency) => {
    const entry = await loseResponse(currency);
    const original = structuredClone(entry.request);
    act(() => {
      client.setQueryData(key, capabilities(false));
    });
    expect(name()).toHaveValue('Confirmed trip');
    expect(field()).toHaveTextContent(currency);
    expect(field()).toBeDisabled();
    expect(create()).toBeDisabled();
    fireEvent.change(name(), { target: { value: 'Wrong replacement' } });
    fireEvent.submit(form());
    expect(name()).toHaveValue('Confirmed trip');
    expect(h.write).toHaveBeenCalledOnce();
    h.lookup.mockResolvedValueOnce(receipt(currency));
    await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
    await waitFor(() => expect(h.success).toHaveBeenCalledExactlyOnceWith({ id: tripId }));
    expect(h.lookup).toHaveBeenLastCalledWith(original.body.client_request_id);
    expect(h.write).toHaveBeenCalledOnce();
    const stored = (await readConfirmedWebWrites(client))[original.body.client_request_id];
    expect(stored.status).toBe('done');
    expect(stored.request).toEqual(original);
  }
);

it('restarting restores the original pending name and currency, not an empty new confirmation', async () => {
  const entry = await loseResponse();
  cleanup();
  client.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  bindConfirmedWebWrites(client, 'bc1c:actor');
  h.read.mockResolvedValue(success(false));
  mount();
  await waitFor(() => expect(name()).toHaveValue('Confirmed trip'));
  expect(name()).toBeDisabled();
  expect(field()).toHaveTextContent('USD');
  h.lookup.mockResolvedValueOnce(receipt('USD'));
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.lookup).toHaveBeenLastCalledWith(entry.request.body.client_request_id);
  expect(h.write).toHaveBeenCalledOnce();
});

it('not_found recovery resends the identical body with the original UUID, with no new creation intent', async () => {
  const entry = await loseResponse();
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.write).toHaveBeenCalledTimes(2);
  expect(h.write.mock.calls[1][0]).toEqual(h.write.mock.calls[0][0]);
  expect(h.write.mock.calls[1][0].client_request_id).toBe(entry.request.body.client_request_id);
});

it('a terminal save failure keeps the form frozen until the original receipt can be saved', async () => {
  h.write.mockImplementationOnce(async () => {
    h.save.mockRejectedValueOnce(new Error('Disk full after commit'));
    return { success: true, data: { id: tripId } };
  });
  mount();
  await ready();
  await userEvent.setup().type(name(), 'Committed remotely');
  await userEvent.setup().click(create());
  await waitFor(() => expect(name()).toBeDisabled());
  const entry = await pendingRecord();
  expect(h.success).not.toHaveBeenCalled();
  fireEvent.submit(form());
  expect(h.write).toHaveBeenCalledOnce();
  h.lookup.mockResolvedValueOnce(receipt('TWD'));
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect((await readConfirmedWebWrites(client))[entry.request.body.client_request_id].status).toBe(
    'done'
  );
});

it('a saved rejection unlocks retained input and permits an explicitly corrected new UUID', async () => {
  h.write.mockResolvedValueOnce({
    success: false,
    error: 'FEATURE_NOT_AVAILABLE',
    code: 'FEATURE_NOT_AVAILABLE',
  });
  mount();
  await ready();
  await choose('USD');
  await userEvent.setup().type(name(), 'Correct later');
  await userEvent.setup().click(create());
  await waitFor(() => expect(name()).toBeEnabled());
  await waitFor(() => expect(create()).toBeEnabled());
  expect(name()).toHaveValue('Correct later');
  expect(screen.getByRole('alert')).toHaveTextContent(en.ledger.writeRejected);
  const first = Object.values(await readConfirmedWebWrites(client))[0];
  expect(first.status).toBe('rejected');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: en.common.close }));
  await user.click(screen.getByRole('button', { name: 'Open create' }));
  await ready();
  await user.click(screen.getByRole('button', { name: en.trips.create.clearDraft }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect((await readConfirmedWebWrites(client))[first.request.body.client_request_id].status).toBe(
    'rejected'
  );
  await user.type(name(), 'Corrected input');
  await choose('JPY');
  await userEvent.setup().click(create());
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.write.mock.calls[1][0].client_request_id).not.toBe(first.request.body.client_request_id);
});

it('failed rejection persistence remains pending and lookup denial cannot unlock it', async () => {
  h.write.mockImplementationOnce(async () => {
    h.save.mockRejectedValueOnce(new Error('Cannot save rejection'));
    return { success: false, error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' };
  });
  mount();
  await ready();
  await userEvent.setup().type(name(), 'Retain frozen');
  await userEvent.setup().click(create());
  await waitFor(() => expect(name()).toBeDisabled());
  const entry = await pendingRecord();
  h.lookup.mockResolvedValueOnce({ success: false, error: 'FORBIDDEN', code: 'FORBIDDEN' });
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: en.ledger.recover })).toBeEnabled()
  );
  expect(name()).toBeDisabled();
  expect((await readConfirmedWebWrites(client))[entry.request.body.client_request_id].status).toBe(
    'pending'
  );
  expect(h.write).toHaveBeenCalledOnce();
});

it('closing an unknown result never discards it, and global recovery updates the same form confirmation', async () => {
  const entry = await loseResponse();
  await userEvent.setup().click(screen.getByRole('button', { name: en.common.close }));
  expect((await readConfirmedWebWrites(client))[entry.request.body.client_request_id].status).toBe(
    'pending'
  );
  h.lookup.mockResolvedValueOnce(receipt('USD'));
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(screen.queryByRole('button', { name: en.ledger.recover })).toBeNull());
  expect(h.success).not.toHaveBeenCalled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Open create' }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.write).toHaveBeenCalledOnce();
});

it('429 recovery pauses the account across reload instead of creating a replacement UUID', async () => {
  const entry = await loseResponse();
  h.lookup.mockResolvedValueOnce({ success: false, error: 'BUSY', code: 'BUSY', retryAfter: 120 });
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: en.ledger.recover })).toBeEnabled()
  );
  const lookups = h.lookup.mock.calls.length;
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  expect(h.lookup).toHaveBeenCalledTimes(lookups);
  const reloaded = new QueryClient();
  bindConfirmedWebWrites(reloaded, 'bc1c:actor');
  await expect(resumeConfirmedWebWrite(reloaded, entry)).rejects.toThrow('ledger.wait');
  expect(h.write).toHaveBeenCalledOnce();
});

it('changing account during a late receipt read neither sends nor routes the previous confirmation', async () => {
  const pending = deferred<ReturnType<typeof receipt>>();
  mount();
  await ready();
  await userEvent.setup().type(name(), 'Account A intent');
  h.lookup.mockReturnValueOnce(pending.promise);
  await userEvent.setup().click(create());
  await waitFor(() => expect(h.lookup).toHaveBeenCalledOnce());
  const owner = captureConfirmedWebScope(client);
  act(() => {
    bindConfirmedWebWrites(client, 'bc1c:other');
  });
  await waitFor(() => expect(document.getElementById('name')).toHaveValue(''));
  expect(owner()).toBe(false);
  await act(async () => pending.resolve(receipt('TWD')));
  expect(h.write).not.toHaveBeenCalled();
  expect(h.success).not.toHaveBeenCalled();
  expect(await readConfirmedWebWrites(client)).toEqual({});
});

it('a failed local journal reread cannot unlock or replace the already confirmed body', async () => {
  const entry = await loseResponse();
  h.localError = new Error('Storage temporarily unavailable');
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['confirmedWebWrites'] });
  });
  expect(name()).toBeDisabled();
  expect(name()).toHaveValue('Confirmed trip');
  fireEvent.submit(form());
  expect(h.write).toHaveBeenCalledOnce();
  h.localError = null;
  h.lookup.mockResolvedValueOnce({
    success: true,
    data: { status: 'rejected', operation: 'trip.create', code: 'FEATURE_NOT_AVAILABLE' },
  });
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(name()).toBeEnabled());
  expect(name()).toHaveValue('Confirmed trip');
  expect((await readConfirmedWebWrites(client))[entry.request.body.client_request_id].status).toBe(
    'rejected'
  );
});

it('expired scope masks confirmed inputs and lets the user close without deleting the durable record', async () => {
  await loseResponse();
  act(() => {
    stopConfirmedWebWrites(client);
    client.clear();
  });
  updateView();
  await waitFor(() => expect(screen.getByText(en.currencyPicker.creation.scopeLost)).toBeVisible());
  expect(document.getElementById('name')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: en.common.close }));
  expect(h.close).toHaveBeenCalledOnce();
  const original = new QueryClient();
  bindConfirmedWebWrites(original, 'bc1c:actor');
  expect(Object.values(await readConfirmedWebWrites(original))[0].status).toBe('pending');
});

it('an empty query mirror does not discard the known UUID or permit a replacement creation', async () => {
  const entry = await loseResponse();
  act(() => {
    client.setQueryData(['confirmedWebWrites'], {});
  });
  expect(name()).toBeDisabled();
  expect(name()).toHaveValue('Confirmed trip');
  fireEvent.submit(form());
  expect(h.write).toHaveBeenCalledOnce();
  h.lookup.mockResolvedValueOnce(receipt('USD'));
  await userEvent.setup().click(screen.getByRole('button', { name: en.ledger.recover }));
  await waitFor(() => expect(h.success).toHaveBeenCalledOnce());
  expect(h.lookup).toHaveBeenLastCalledWith(entry.request.body.client_request_id);
});

it('an optional companion delivery failure cannot turn a durably created trip into a failed confirmation', async () => {
  h.friends = [
    { user: { id: '65a000000000000000000003', display_name: 'Alice', avatar_url: null } },
  ];
  let reject!: (error: unknown) => void;
  h.add.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail;
    })
  );
  mount();
  await ready();
  const user = userEvent.setup();
  await user.type(name(), 'Created already');
  await user.click(screen.getByRole('button', { name: en.trips.create.moreDetailsWithFriends }));
  await user.click(screen.getByRole('checkbox'));
  await user.click(create());
  await waitFor(() =>
    expect(screen.getByText(en.currencyPicker.creation.openingCreated)).toBeVisible()
  );
  expect(h.success).not.toHaveBeenCalled();
  await act(async () => reject(new TypeError('Companion response lost')));
  await waitFor(() => expect(h.success).toHaveBeenCalledExactlyOnceWith({ id: tripId }));
  expect(h.write).toHaveBeenCalledOnce();
  expect(Object.values(await readConfirmedWebWrites(client))[0].status).toBe('done');
});
