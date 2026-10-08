import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ApiClient, type Fetcher } from '@/api/client';
import { expenseOptionsSchema, expensePreviewSchema, type ExpenseOptions } from '@/api/contracts';
import { SessionManager, type CredentialStore } from '@/api/session';
import { DraftEditor } from '@/features/expenses/draftEditor';
import {
  confirmedFields,
  newDraft,
  previewInputOf,
  validateDraft,
} from '@/features/expenses/draft';
import { ExpenseEntry } from '@/features/expenses/entry';
import { createDraftTripStore } from '@/storage/draftTrips';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { decodeCredential, encodeCredential } from '@/storage/sessionCredential';
import { fakeExpenseServer, hex, uuidOf } from '@/test/expenseServer';
import { memoryDatabase } from '@/test/sqlite';
import { DraftCatalog } from './catalog';

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const initial: ExpenseOptions = {
  ledger: { baseCurrency: 'TWD', moneyScale: 2 },
  members: [
    { id: hex(1), displayName: 'Ann' },
    { id: hex(2), displayName: 'Bob' },
  ],
  categories: ['food'],
};
const refreshed: ExpenseOptions = {
  ...initial,
  members: [
    { id: hex(1), displayName: 'Ann' },
    { id: hex(3), displayName: 'Cat' },
  ],
};
const opened: { close(): void }[] = [];
const dirs: string[] = [];
afterEach(() => {
  opened.splice(0).forEach((db) => db.close());
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
it('offline cold start edits only raw input, then requires restored auth, current members and a new server preview before C', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tb-d2-flow-'));
  dirs.push(dir);
  const path = join(dir, 'device.db');
  const open = () => {
    const db = memoryDatabase(path);
    opened.push(db);
    return db;
  };
  const server = fakeExpenseServer();
  server.addAccount(hex(1), 'Ann');
  server.addAccount(hex(2), 'Bob');
  server.addAccount(hex(3), 'Cat');
  for (const member of [hex(1), hex(2), hex(3)]) server.addMember(tripId, member);
  let online = true;
  let options = initial;
  const fetcher: Fetcher = async (url, init) => {
    if (!online) throw new TypeError('airplane mode');
    const route = new URL(url).pathname;
    if (route.endsWith('/expense-options'))
      return Response.json({
        data: { ...options, ledger: { baseCurrency: 'TWD', moneyScale: 2 } },
      });
    if (route.endsWith('/expenses/preview'))
      return Response.json({
        data: {
          ledger: { baseCurrency: 'TWD', moneyScale: 2 },
          originalAmount: 100,
          currency: 'TWD',
          exchangeRate: 1,
          amount: 100,
          splits: options.members.map((member) => ({
            userId: member.id,
            displayName: member.displayName,
            shareAmount: 50,
          })),
        },
      });
    return server.fetcher(url, init);
  };
  let saved: string | null = null;
  const credentials: CredentialStore = {
    get: async () => decodeCredential(saved).token,
    getLocalUser: async () => decodeCredential(saved).user,
    set: async (token, user) => {
      saved = encodeCredential(token, user);
    },
    clear: async () => {
      saved = null;
    },
  };
  const makeManager = () =>
    new SessionManager(new ApiClient(scope.environment, fetcher), credentials, async () => {});
  const firstManager = makeManager();
  await firstManager.login('Ann', 'password');
  const db = open();
  const catalog = new DraftCatalog(async () => createDraftTripStore(db));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stop = catalog.observe(client);
  await catalog.rememberName(scope, tripId, 'Private holiday');
  await client.fetchQuery({
    queryKey: [scope.environment, scope.accountId, 'expense-options', tripId],
    queryFn: () =>
      firstManager.requestAs(
        scope.accountId,
        `/trips/${tripId}/expense-options`,
        expenseOptionsSchema
      ),
  });
  expect((await catalog.get(scope, tripId))?.options).toEqual(initial);
  stop();
  client.clear();
  opened.pop()!.close();

  online = false;
  const restartedDb = open();
  const manager = makeManager();
  await manager.restore();
  expect(manager.getSnapshot().status).toBe('local');
  const restartedCatalog = new DraftCatalog(async () => createDraftTripStore(restartedDb));
  const local = await restartedCatalog.get(scope, tripId);
  expect(local?.name).toBe('Private holiday');
  const pending = await createPendingExpenseStore(restartedDb);
  const editor = new DraftEditor({
    store: async () => pending,
    scope,
    tripId,
    initial: () => newDraft(local!.options!, scope.accountId, '2026-10-05'),
    newId: () => uuidOf(1),
  });
  await editor.initialize();
  editor.edit({
    ...editor.getSnapshot().record!.input,
    description: 'Offline lunch',
    amountText: '100',
  });
  const raw = await editor.flush();
  expect(await pending.list(scope)).toEqual([]);
  expect(server.expenses).toEqual([]);
  expect(server.posts()).toEqual([]);

  // The user reopens the persisted draft; no local preview or confirmed shares were saved.
  const resumed = new DraftEditor({
    store: async () => pending,
    scope,
    tripId,
    initial: () => newDraft(initial, scope.accountId, '2026-10-05'),
    newId: () => uuidOf(2),
  });
  await resumed.initialize();
  expect(resumed.getSnapshot().phase).toBe('choice');
  resumed.restore();
  expect(resumed.getSnapshot().record).toEqual(raw);
  online = true;
  options = refreshed;
  await manager.restore();
  expect(manager.getSnapshot().status).toBe('signedIn');
  expect(server.posts()).toEqual([]); // Reconnecting/rotating alone never writes an expense.
  const fresh = await manager.requestAs(
    scope.accountId,
    `/trips/${tripId}/expense-options`,
    expenseOptionsSchema
  );
  resumed.setInitial(() => newDraft(fresh, scope.accountId, '2026-10-05'));
  expect(validateDraft(raw.input, fresh)).toContainEqual({ field: 'members', code: 'changed' });
  expect(previewInputOf(raw.input, fresh)).toBeNull();
  expect(resumed.getSnapshot().record!.input.memberIds).toEqual([hex(1), hex(2)]);
  // Explicit member confirmation replaces Bob; the client never silently shrinks the split.
  resumed.edit({ ...raw.input, memberIds: [hex(1), hex(3)] });
  const ready = await resumed.flush();
  const preview = await manager.requestAs(
    scope.accountId,
    `/trips/${tripId}/expenses/preview`,
    expensePreviewSchema,
    { method: 'POST', body: previewInputOf(ready.input, fresh) }
  );
  const entry = new ExpenseEntry({
    store: async () => pending,
    request: (userId, route, schema, request) => manager.requestAs(userId, route, schema, request),
    newId: () => uuidOf(100),
  });
  const result = await entry.submit(
    scope,
    tripId,
    confirmedFields(ready.input, fresh, preview),
    ready
  );
  expect(result.kind).toBe('saved');
  expect(server.expenses).toHaveLength(1);
  expect(server.posts()).toHaveLength(1);
  expect(await pending.drafts.load(scope, tripId)).toBeNull();
  expect(await pending.list(scope)).toEqual([]);
});
