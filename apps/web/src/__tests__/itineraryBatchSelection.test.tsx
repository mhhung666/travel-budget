import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import zh from '@/i18n/messages/zh.json';
import en from '@/i18n/messages/en.json';
import zhCN from '@/i18n/messages/zh-CN.json';
import jp from '@/i18n/messages/jp.json';
import type { ActivityDeletionPreview } from '@travel-budget/contracts';
import type { Activity, ItineraryDay } from '@/types';
const h = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  save: vi.fn(),
  preview: vi.fn(),
  lookup: vi.fn(),
  write: vi.fn(),
  toast: vi.fn(),
  online: true,
  locale: 'zh',
}));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(h.storage.get(key)),
  update: async (key: string, fn: (v: unknown) => unknown) => {
    await h.save();
    h.storage.set(key, structuredClone(fn(h.storage.get(key))));
  },
}));
vi.mock('@/actions', () => ({
  previewWebActivityDeletion: h.preview,
  lookupWebActivityDeletion: h.lookup,
  writeWebActivityDeletion: h.write,
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => h.online }));
const catalogs = { zh, en, 'zh-CN': zhCN, jp };
vi.mock('next-intl', async (original) => {
  const actual = await original<typeof import('next-intl')>();
  return {
    ...actual,
    useLocale: () => h.locale,
    useTranslations: (namespace: keyof typeof zh | 'itinerary.batch' | 'itinerary.activities') =>
      actual.createTranslator({
        locale: h.locale,
        messages: catalogs[h.locale as keyof typeof catalogs],
        namespace,
      }),
  };
});
import { ActivityBatchDeletionProvider } from '@/components/trips/detail/itinerary/ActivityBatchDeletion';
import ItineraryDayCard from '@/components/trips/detail/itinerary/ItineraryDayCard';
import {
  bindConfirmedWebWrites,
  confirmWebWrite,
  readConfirmedWebWrites,
} from '@/lib/confirmedWebWrites';
import { retainHistoryNavigation } from '@/lib/historyNavigation';
import { ConfirmedWebRecovery } from '@/components/expenses/ConfirmedWebRecovery';
const tripId = 'a'.repeat(24),
  dayId = 'b'.repeat(24);
const activities: Activity[] = Array.from({ length: 3 }, (_, i) => ({
  id: String(i + 1).repeat(24),
  revision: 1,
  title: 'Same name',
  time: `0${i + 7}:00`,
  end_time: null,
  type: 'food',
  location: null,
  location_name: 'Station',
  note: '',
  confirmation_code: 'Private PNR',
  attachments: [],
}));
const day: ItineraryDay = {
  id: dayId,
  trip_id: tripId,
  day_number: 2,
  revision: 1,
  title: 'Kyoto',
  content: 'Description',
  location: null,
  activities,
  created_at: '2028-01-01',
  updated_at: '2028-01-01',
};
const dates = new Map([[dayId, '2028-02-29']]);
const response = (items = activities): ActivityDeletionPreview => ({
  tripId,
  dayId,
  dayNumber: 2,
  date: '2028-02-29',
  title: 'Kyoto',
  targets: items.map((a) => ({
    activityId: a.id,
    revision: a.revision,
    time: a.time,
    endTime: a.end_time,
    title: a.title,
    locationName: a.location_name ?? '',
  })),
  missingIds: [],
  changedIds: [],
  contextRevision: 'e'.repeat(64),
});
let client: QueryClient;
beforeEach(() => {
  h.storage.clear();
  vi.clearAllMocks();
  h.online = true;
  h.locale = 'zh';
  h.save.mockResolvedValue(undefined);
  h.preview.mockImplementation(async (_trip, body) => ({
    success: true,
    data: response(
      activities.filter((a) =>
        body.targets.some((t: { activityId: string }) => t.activityId === a.id)
      )
    ),
  }));
  h.lookup.mockResolvedValue({ success: true, data: { status: 'not_found' } });
  h.write.mockImplementation(async (_trip, body) => ({
    success: true,
    data: {
      status: 'committed',
      operation: 'activities.delete',
      tripId,
      client_request_id: body.client_request_id,
      result: {
        dayId,
        activityIds: body.targets.map((t: { activityId: string }) => t.activityId),
        count: body.targets.length,
      },
    },
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  bindConfirmedWebWrites(client, 'BD1:actor');
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
const card = (d: ItineraryDay, admin: boolean) => (
  <ItineraryDayCard
    day={d}
    date={dates.get(d.id)}
    tripId={tripId}
    isAdmin={admin}
    onEdit={vi.fn()}
    onDelete={vi.fn()}
    onAddActivity={vi.fn()}
    onEditActivity={vi.fn()}
    onDeleteActivity={vi.fn()}
    onImportActivity={vi.fn()}
    importedActivityIds={new Set()}
    photos={[]}
    onSelectPhoto={vi.fn()}
  />
);
function tree(d = day, isAdmin = true, otherDays: ItineraryDay[] = []) {
  return (
    <QueryClientProvider client={client}>
      <ConfirmedWebRecovery />
      <ActivityBatchDeletionProvider
        tripId={tripId}
        days={[d, ...otherDays]}
        dates={dates}
        isAdmin={isAdmin}
      >
        <a href="/elsewhere">Leave</a>
        {card(d, isAdmin)}
        {otherDays.map((other) => (
          <div key={other.id}>{card(other, isAdmin)}</div>
        ))}
      </ActivityBatchDeletionProvider>
    </QueryClientProvider>
  );
}
async function select() {
  await userEvent.click(screen.getByRole('button', { name: '選取活動' }));
}
const row = (time = '07:00') =>
  screen.getByRole('checkbox', { name: new RegExp(`${time} · Same name`) });
async function review() {
  await userEvent.click(screen.getByRole('button', { name: /^刪除 \d 項$/ }));
  await screen.findByRole('alertdialog');
}
it('uses visible admin entry and whole-row keyboard checkboxes, hides competing actions, and supports mixed/all/none', async () => {
  render(tree());
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  await select();
  expect(screen.queryByRole('button', { name: '新增活動' })).toBeNull();
  expect(screen.queryByRole('button', { name: '更多操作' })).toBeNull();
  expect(screen.queryByText('Private PNR')).toBeNull();
  row().focus();
  await userEvent.keyboard(' ');
  expect(row()).toBeChecked();
  expect(screen.getByRole('checkbox', { name: '全選本日' })).toHaveAttribute(
    'aria-checked',
    'mixed'
  );
  await userEvent.click(screen.getByRole('checkbox', { name: '全選本日' }));
  expect(
    screen
      .getAllByRole('checkbox')
      .every((c) => c.getAttribute('aria-checked') === 'true' || (c as HTMLInputElement).checked)
  ).toBe(true);
  await userEvent.click(screen.getByRole('checkbox', { name: '取消全選' }));
  expect(screen.getByRole('button', { name: '刪除 0 項' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '選取活動' })).toHaveFocus());
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});
it('reviews before confirming, retains selection on cancel, and never expands it after reorder/new activities', async () => {
  const ui = render(tree());
  await select();
  await userEvent.click(row());
  ui.rerender(
    tree({
      ...day,
      activities: [
        activities[2],
        activities[1],
        activities[0],
        { ...activities[0], id: 'd'.repeat(24), time: '10:00' },
      ],
    })
  );
  expect(row()).toBeChecked();
  expect(row('08:00')).not.toBeChecked();
  expect(row('10:00')).not.toBeChecked();
  await review();
  expect(h.write).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('2028-02-29');
  await userEvent.click(screen.getByRole('button', { name: '返回選取' }));
  expect(row()).toBeChecked();
  await review();
  await userEvent.click(screen.getByRole('button', { name: '確認刪除 1 項' }));
  await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0));
  expect(Object.values(await readConfirmedWebWrites(client))[0].status).toBe('done');
  expect(h.toast).toHaveBeenCalledWith({ description: '已刪除 1 項活動' });
});
it('requires accepting changed day/activity details and a new review before confirmation', async () => {
  render(tree());
  await select();
  await userEvent.click(row());
  h.preview.mockResolvedValueOnce({
    success: true,
    data: {
      ...response([activities[0]]),
      title: 'New day',
      changedIds: [activities[0].id],
      targets: [{ ...response([activities[0]]).targets[0], revision: 2, title: 'Updated event' }],
    },
  });
  await review();
  expect(screen.getByRole('button', { name: '確認刪除 1 項' })).toBeDisabled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('New day');
  await userEvent.click(screen.getByRole('button', { name: '採用最新內容並返回選取' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(h.write).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '刪除 1 項' }));
  await screen.findByRole('alertdialog');
  expect(h.preview.mock.calls[1][1].targets[0].expectedRevision).toBe(2);
});
it('requires explicitly removing a vanished target, and invalidates an open confirmation on selected-data updates', async () => {
  const ui = render(tree());
  await select();
  await userEvent.click(row());
  await userEvent.click(row('08:00'));
  h.preview.mockResolvedValueOnce({
    success: true,
    data: { ...response([activities[1]]), missingIds: [activities[0].id] },
  });
  await review();
  expect(screen.getByRole('button', { name: '確認刪除 2 項' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '移除失效選取' }));
  expect(screen.getByRole('button', { name: '刪除 1 項' })).toBeEnabled();
  await review();
  ui.rerender(
    tree({
      ...day,
      activities: activities.map((a) => (a.id === activities[1].id ? { ...a, revision: 2 } : a)),
    })
  );
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(h.write).not.toHaveBeenCalled();
});
it('protects selections on link departure and handles Escape one layer at a time', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(tree());
  await select();
  await userEvent.click(row());
  fireEvent.click(screen.getByRole('link', { name: 'Leave' }));
  expect(confirm).toHaveBeenCalledWith('離開並清除選取？');
  expect(row()).toBeChecked();
  await review();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(row()).toBeChecked();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  await waitFor(() => expect(screen.getByRole('button', { name: '選取活動' })).toHaveFocus());
});
it('does not send if initial saving fails, or allow double clicks while confirmation is in flight', async () => {
  render(tree());
  await select();
  await userEvent.click(row());
  await review();
  h.save.mockRejectedValueOnce(new Error('quota'));
  await userEvent.click(screen.getByRole('button', { name: '確認刪除 1 項' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('尚未送出'));
  expect(h.write).not.toHaveBeenCalled();
  let resolve!: (value: unknown) => void;
  h.write.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      })
  );
  const button = screen.getByRole('button', { name: '確認刪除 1 項' });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(h.write).toHaveBeenCalledOnce());
  await act(async () =>
    resolve({
      success: true,
      data: {
        status: 'committed',
        operation: 'activities.delete',
        tripId,
        client_request_id: h.write.mock.calls[0][1].client_request_id,
        result: { dayId, activityIds: [activities[0].id], count: 1 },
      },
    })
  );
});
it('does not silently truncate oversized days and does not expose selection to non-admins or offline clients', async () => {
  const longDay = {
    ...day,
    activities: Array.from({ length: 16 }, (_, i) => ({
      ...activities[0],
      id: i.toString(16).padStart(24, '0'),
    })),
  };
  const ui = render(tree(longDay));
  await select();
  expect(screen.getByRole('checkbox', { name: '全選本日' })).toBeDisabled();
  expect(screen.getByText(/單批最多 15 項/)).toBeInTheDocument();
  ui.rerender(tree(longDay, false));
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: '選取活動' })).toBeNull();
  h.online = false;
  ui.rerender(tree());
  expect(screen.getByRole('button', { name: '選取活動' })).toBeDisabled();
});
it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])(
  'provides translated selection and impact confirmation in %s',
  async (locale) => {
    h.locale = locale;
    const strings = catalogs[locale].itinerary.batch;
    render(tree());
    await userEvent.click(screen.getByRole('button', { name: strings.start }));
    await userEvent.click(row());
    await userEvent.click(
      screen.getByRole('button', { name: strings.delete.replace('{count}', '1') })
    );
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(strings.impact);
  }
);
it('keeps a durable rejection distinct from an unknown submission and restores the selected set', async () => {
  h.write.mockImplementationOnce(async (_trip, body) => ({
    success: true,
    data: {
      status: 'rejected',
      operation: 'activities.delete',
      client_request_id: body.client_request_id,
      tripId,
      code: 'CONFLICT',
    },
  }));
  render(tree());
  await select();
  await userEvent.click(row());
  await review();
  await userEvent.click(screen.getByRole('button', { name: '確認刪除 1 項' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(row()).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent(zh.itinerary.batch.conflict);
  expect(screen.queryByText(zh.itinerary.batch.unknown)).toBeNull();
  expect(Object.values(await readConfirmedWebWrites(client))[0].status).toBe('rejected');
});
async function savedUnknownBatch() {
  const uuid = crypto.randomUUID();
  h.write.mockRejectedValueOnce(new Error('lost response'));
  await expect(
    confirmWebWrite(client, {
      operation: 'activities.delete',
      tripId,
      body: {
        client_request_id: uuid,
        dayId,
        targets: activities
          .slice(0, 2)
          .map((a) => ({ activityId: a.id, expectedRevision: a.revision })),
        expectedContextRevision: 'e'.repeat(64),
      },
    })
  ).rejects.toThrow('lost response');
  return uuid;
}
it('recovers a NOT_FOUND rejection into editable selection, removes a missing target and submits only the reviewed remainder', async () => {
  const uuid = await savedUnknownBatch();
  h.lookup.mockImplementation(async (_trip, id) => ({
    success: true,
    data:
      id === uuid
        ? {
            status: 'rejected',
            operation: 'activities.delete',
            client_request_id: uuid,
            tripId,
            code: 'NOT_FOUND',
          }
        : { status: 'not_found' },
  }));
  render(tree());
  await waitFor(() => expect(screen.getByRole('button', { name: '刪除 2 項' })).toBeEnabled());
  expect(row()).toBeChecked();
  expect(row('08:00')).toBeChecked();
  expect(screen.getByRole('alert')).toHaveTextContent(zh.itinerary.batch.conflict);
  expect(screen.queryByText(zh.itinerary.batch.unknown)).toBeNull();
  h.preview.mockResolvedValueOnce({
    success: true,
    data: { ...response([activities[1]]), missingIds: [activities[0].id] },
  });
  await review();
  await userEvent.click(screen.getByRole('button', { name: '移除失效選取' }));
  await review();
  await userEvent.click(screen.getByRole('button', { name: '確認刪除 1 項' }));
  await waitFor(() => expect(h.write).toHaveBeenCalledTimes(2));
  expect(h.write.mock.calls[1][1].targets).toEqual([
    { activityId: activities[1].id, expectedRevision: 1 },
  ]);
  expect(h.write.mock.calls[1][1].client_request_id).not.toBe(uuid);
  await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0));
  await select();
  expect(row()).not.toBeChecked();
});
it('keeps a NOT_FOUND lookup failure pending without permanently disabling selection', async () => {
  const uuid = await savedUnknownBatch();
  h.lookup.mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'NOT_FOUND' });
  render(tree());
  await waitFor(() =>
    expect(screen.getAllByText(zh.itinerary.batch.unknown).length).toBeGreaterThan(0)
  );
  expect(row()).toBeChecked();
  expect((await readConfirmedWebWrites(client))[uuid].status).toBe('pending');
  expect(h.write).toHaveBeenCalledOnce();
  h.lookup.mockResolvedValue({
    success: true,
    data: {
      status: 'rejected',
      operation: 'activities.delete',
      client_request_id: uuid,
      tripId,
      code: 'NOT_FOUND',
    },
  });
  await userEvent.click(screen.getByRole('button', { name: '查詢並恢復' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '刪除 2 項' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  await select();
  expect(row()).not.toBeChecked();
});
it('reviews a vanished day as missing targets and leaves other days selectable', async () => {
  const other = { ...day, id: 'c'.repeat(24), day_number: 3, title: 'Osaka' };
  render(tree(day, true, [other]));
  await userEvent.click(screen.getAllByRole('button', { name: '選取活動' })[0]);
  await userEvent.click(row());
  h.preview.mockResolvedValueOnce({ success: false, code: 'NOT_FOUND', error: 'NOT_FOUND' });
  await review();
  expect(screen.getByRole('button', { name: '確認刪除 1 項' })).toBeDisabled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent(zh.itinerary.batch.missing);
  await userEvent.click(screen.getByRole('button', { name: '移除失效選取' }));
  expect(screen.getByRole('button', { name: '刪除 0 項' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '選取活動' }));
  expect(screen.getByRole('button', { name: '刪除 0 項' })).toBeDisabled();
  expect(row()).not.toBeChecked();
  expect(h.write).not.toHaveBeenCalled();
});
it.each(['FORBIDDEN', 'UNAUTHORIZED'])(
  'still clears and blocks selection when recovery really denies access: %s',
  async (code) => {
    const uuid = await savedUnknownBatch();
    h.lookup.mockResolvedValue({ success: false, code, error: code });
    render(tree());
    await waitFor(() => expect(h.lookup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0));
    await select();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect((await readConfirmedWebWrites(client))[uuid].status).toBe('pending');
    expect(h.write).toHaveBeenCalledOnce();
  }
);
it.each([-2, -1, 1, 2])(
  'retains URL, router and selection after cancelling a %i-entry browser traversal',
  async (delta) => {
    const root = retainHistoryNavigation();
    const router = vi.fn();
    const allow = vi.spyOn(window, 'confirm').mockReturnValue(false);
    window.addEventListener('popstate', router);
    try {
      history.pushState({ __NA: true }, '', '/before');
      history.pushState({ __NA: true }, '', '/selected');
      history.pushState({ __NA: true }, '', '/after-one');
      history.pushState({ __NA: true }, '', '/after-two');
      if (delta > 0) {
        history.go(-2);
        await waitFor(() => expect(location.pathname).toBe('/selected'));
      }
      const origin = location.href;
      const state = structuredClone(history.state);
      router.mockClear();
      render(tree());
      await select();
      await userEvent.click(row());
      act(() => history.go(delta));
      await waitFor(() => expect(allow).toHaveBeenCalledOnce());
      await waitFor(() => expect(location.href).toBe(origin));
      expect(history.state).toEqual(state);
      expect(row()).toBeChecked();
      expect(router).not.toHaveBeenCalled();
    } finally {
      cleanup();
      root.release();
      window.removeEventListener('popstate', router);
    }
  }
);
