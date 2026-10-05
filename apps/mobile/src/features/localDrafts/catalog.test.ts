import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { recordAccessDenial } from '@/features/auth/accessGuard';
import { createDraftTripStore, type DraftTripStore } from '@/storage/draftTrips';
import { memoryDatabase } from '@/test/sqlite';
import { hex } from '@/test/expenseServer';
import { DraftCatalog } from './catalog';

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const options = { members: [{ id: hex(1), displayName: 'Ann' }], categories: ['food' as const] };
const opened: { close(): void }[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
  opened.splice(0).forEach((db) => db.close());
});
async function setup() {
  const db = memoryDatabase();
  opened.push(db);
  const store = await createDraftTripStore(db);
  const catalog = new DraftCatalog(
    async () => store,
    () => 100
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const stop = catalog.observe(client);
  cleanups.push(stop, () => client.clear());
  return { db, store, catalog, client, stop };
}
const key = (resource = 'expense-options') => [
  scope.environment,
  scope.accountId,
  resource,
  tripId,
];
it('captures real successful options reads but never treats manually seeded cache as authorization', async () => {
  const h = await setup();
  h.client.setQueryData(key(), options);
  expect(await h.catalog.get(scope, tripId)).toBeNull();
  await h.client.fetchQuery({ queryKey: key(), queryFn: async () => options });
  expect(await h.catalog.get(scope, tripId)).toMatchObject({ options, updatedAt: 100 });
});
it('persists names from validated trip lists without amounts, descriptions or private budgets', async () => {
  const h = await setup();
  const trip = {
    id: tripId,
    name: 'Secret trip',
    description: 'Private description',
    startDate: null,
    endDate: null,
    destination: 'Tokyo',
    archived: false,
    memberCount: 1,
    mySpent: 999,
    myBalance: 45,
    phase: 'unscheduled',
  };
  await h.client.fetchQuery({
    queryKey: [scope.environment, scope.accountId, 'trips', 'today'],
    queryFn: async () => ({ pages: [{ items: [trip], nextPage: null }], pageParams: [1] }),
  });
  const snapshot = await h.catalog.get(scope, tripId);
  expect(snapshot).toMatchObject({ name: 'Secret trip', options: null });
  expect(JSON.stringify(snapshot)).not.toContain('mySpent');
  expect(JSON.stringify(snapshot)).not.toContain('Private description');
});
it.each(['trip', 'expense-options', 'expenses', 'settlement'])(
  'hides %s denial immediately and across a reopened catalog',
  async (resource) => {
    const h = await setup();
    await h.catalog.rememberOptions(scope, tripId, options);
    await expect(
      h.client.fetchQuery({
        queryKey: key(resource),
        queryFn: async () => {
          throw new ApiError('NOT_FOUND', 404);
        },
      })
    ).rejects.toThrow();
    expect(h.catalog.isVisible(scope, tripId)).toBe(false);
    expect(await h.catalog.get(scope, tripId)).toBeNull();
    await h.catalog.list(scope); // waits for the durable tombstone
    const restarted = new DraftCatalog(async () => createDraftTripStore(h.db));
    expect(await restarted.list(scope)).toEqual([]);
  }
);
it('preview denial is durable and a transport failure or trip name cannot reveal it again', async () => {
  const h = await setup();
  await h.client.fetchQuery({ queryKey: key(), queryFn: async () => options });
  await h.catalog.get(scope, tripId);
  recordAccessDenial(h.client, key(), new ApiError('NOT_FOUND', 404));
  expect(h.catalog.isVisible(scope, tripId)).toBe(false);
  await expect(
    h.client.fetchQuery({
      queryKey: key(),
      queryFn: async () => {
        throw new ApiError('NETWORK');
      },
    })
  ).rejects.toThrow();
  await h.catalog.rememberName(scope, tripId, 'Late name');
  expect(await h.catalog.list(scope)).toEqual([]);
  await h.client.fetchQuery({ queryKey: key(), queryFn: async () => options });
  expect(await h.catalog.get(scope, tripId)).toMatchObject({ options });
});
it('does not revoke trip access for a missing individual expense or refresh transport failure', async () => {
  const h = await setup();
  await h.catalog.rememberOptions(scope, tripId, options);
  for (const [resource, error] of [
    ['expense', new ApiError('NOT_FOUND', 404)],
    ['expense-options', new ApiError('REFRESH_ERROR', 403, undefined, 'refresh')],
    ['trip', new ApiError('TIMEOUT')],
  ] as const) {
    await expect(
      h.client.fetchQuery({
        queryKey: key(resource),
        queryFn: async () => {
          throw error;
        },
      })
    ).rejects.toThrow();
    expect(await h.catalog.get(scope, tripId)).not.toBeNull();
  }
});
it('a late stored success cannot clear a newer denial before its tombstone completes', async () => {
  const h = await setup();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const store: DraftTripStore = {
    ...h.store,
    rememberOptions: async (...args) => {
      await gate;
      return h.store.rememberOptions(...args);
    },
  };
  const catalog = new DraftCatalog(async () => store);
  const saving = catalog.rememberOptions(scope, tripId, options);
  const denying = catalog.deny(scope, tripId);
  finish();
  await saving;
  expect(catalog.isVisible(scope, tripId)).toBe(false);
  await denying;
  expect(await catalog.get(scope, tripId)).toBeNull();
});
it.each(['trip', 'expense-options', 'expenses', 'settlement', 'preview'])(
  'ignores an options response started before a %s denial, including on disk',
  async (resource) => {
    const h = await setup();
    await h.catalog.rememberOptions(scope, tripId, options);
    let finish!: (value: typeof options) => void;
    const response = new Promise<typeof options>((resolve) => {
      finish = resolve;
    });
    const reading = h.client.fetchQuery({ queryKey: key(), queryFn: () => response });
    if (resource === 'preview') {
      recordAccessDenial(h.client, key(), new ApiError('FORBIDDEN', 403));
    } else if (resource === 'expense-options') {
      // A separate options query can overlap with the one already in flight.
      await expect(
        h.client.fetchQuery({
          queryKey: [...key(), 'revalidate'],
          queryFn: async () => {
            throw new ApiError('NOT_FOUND', 404);
          },
        })
      ).rejects.toThrow();
    } else {
      await expect(
        h.client.fetchQuery({
          queryKey: key(resource),
          queryFn: async () => {
            throw new ApiError('NOT_FOUND', 404);
          },
        })
      ).rejects.toThrow();
    }
    expect(h.catalog.isVisible(scope, tripId)).toBe(false);
    await h.catalog.list(scope); // The tombstone is durable before the old response arrives.
    finish(options);
    await reading;
    expect(h.catalog.isVisible(scope, tripId)).toBe(false);
    expect(await h.catalog.get(scope, tripId)).toBeNull();
    expect(await h.store.list(scope)).toEqual([]);
    const restarted = new DraftCatalog(async () => createDraftTripStore(h.db));
    expect(await restarted.get(scope, tripId)).toBeNull();

    // Only a request begun after the denial may restore access and the persisted snapshot.
    const fresh = { ...options, members: [{ id: hex(2), displayName: 'Cat' }] };
    await h.client.fetchQuery({ queryKey: key(), queryFn: async () => fresh });
    expect(await h.catalog.get(scope, tripId)).toMatchObject({ options: fresh });
    expect(await restarted.get(scope, tripId)).toMatchObject({ options: fresh });

    // A later denial invalidates another read even after a successful authorization recovery.
    const next = new Promise<typeof options>((resolve) => {
      finish = resolve;
    });
    const readingAgain = h.client.fetchQuery({ queryKey: key(), queryFn: () => next });
    await h.catalog.deny(scope, tripId);
    finish(fresh);
    await readingAgain;
    expect(await h.catalog.get(scope, tripId)).toBeNull();
    expect(await restarted.get(scope, tripId)).toBeNull();
  }
);
it('does not lift a denial with a request whose start was not observed', async () => {
  const h = await setup();
  h.stop();
  let finish!: (value: typeof options) => void;
  const reading = h.client.fetchQuery({
    queryKey: key(),
    queryFn: () =>
      new Promise<typeof options>((resolve) => {
        finish = resolve;
      }),
  });
  const catalog = new DraftCatalog(async () => h.store);
  cleanups.push(catalog.observe(h.client));
  await catalog.deny(scope, tripId);
  finish(options);
  await reading;
  expect(await catalog.get(scope, tripId)).toBeNull();
  expect(await h.store.list(scope)).toEqual([]);
});
it('keeps denial generations isolated by environment, account and trip', async () => {
  const h = await setup();
  let finish!: (value: typeof options) => void;
  const reading = h.client.fetchQuery({
    queryKey: key(),
    queryFn: () =>
      new Promise<typeof options>((resolve) => {
        finish = resolve;
      }),
  });
  await h.catalog.deny({ ...scope, environment: 'https://b.test' }, tripId);
  await h.catalog.deny({ ...scope, accountId: hex(2) }, tripId);
  await h.catalog.deny(scope, hex(200));
  finish(options);
  await reading;
  expect(await h.catalog.get(scope, tripId)).toMatchObject({ options });
});
it('a failed tombstone remains hidden and is retried before listing disk snapshots', async () => {
  const h = await setup();
  await h.store.rememberOptions(scope, tripId, options, 1);
  let fail = true;
  const store: DraftTripStore = {
    ...h.store,
    deny: async (...args) => {
      if (fail) throw new Error('disk full');
      return h.store.deny(...args);
    },
  };
  const catalog = new DraftCatalog(async () => store);
  await expect(catalog.deny(scope, tripId)).rejects.toThrow('disk full');
  expect(catalog.getSnapshot().storageFailed).toBe(true);
  expect(await catalog.get(scope, tripId)).toBeNull();
  await expect(catalog.list(scope)).rejects.toThrow('disk full');
  fail = false;
  expect(await catalog.list(scope)).toEqual([]);
  expect(await h.store.list(scope)).toEqual([]);
});
it('keeps a failed options-save warning through unrelated successful name writes, then clears it on retry', async () => {
  const h = await setup();
  let fail = true;
  const store: DraftTripStore = {
    ...h.store,
    rememberOptions: async (...args) => {
      if (fail) throw new Error('disk full');
      return h.store.rememberOptions(...args);
    },
  };
  const catalog = new DraftCatalog(async () => store);
  await expect(catalog.rememberOptions(scope, tripId, options)).rejects.toThrow('disk full');
  await catalog.rememberName(scope, hex(200), 'Other trip');
  expect(catalog.getSnapshot().storageFailed).toBe(true);
  expect((await catalog.get(scope, hex(200)))?.name).toBe('Other trip');
  fail = false;
  await catalog.rememberOptions(scope, tripId, options);
  expect(catalog.getSnapshot().storageFailed).toBe(false);
});
