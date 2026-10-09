import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiClient } from '@/api/client';
import { SessionManager } from '@/api/session';
import { createPendingExpenseStore, type SqlDatabase } from '@/storage/pendingExpenses';
import type { StoredExpenseDraft } from '@/storage/expenseDrafts';
import { memoryDatabase } from '@/test/sqlite';
import { fakeExpenseServer, hex, uuidOf } from '@/test/expenseServer';
import { ExpenseEntry, sameExpense } from './entry';
import { confirmedFields, newDraft } from './draft';
import { insertLegacyPending } from '@/test/legacy';
describe.each(['legacy', 'equal', 'amount', 'percent', 'shares'] as const)(
  'currency / %s recovery',
  (mode) => {
    const [ME, OTHER, TRIP] = [hex(1), hex(2), hex(100)];
    const ledger = { baseCurrency: 'TWD', moneyScale: 2 as const };
    const options = {
      ledger,
      members: [{ id: ME, displayName: 'Me' }],
      categories: ['food' as const],
      ...(mode !== 'legacy' ? { splitPreviewModes: [mode], splitCreateModes: [mode] } : {}),
    };
    const draft = (scope: { environment: string; accountId: string }): StoredExpenseDraft => ({
      ...scope,
      tripId: TRIP,
      draftId: uuidOf(9),
      revision: 1,
      updatedAt: 1000,
      input: {
        ...(mode !== 'legacy' ? { splitMode: mode } : {}),
        ...(mode === 'amount' || mode === 'percent' || mode === 'shares'
          ? { splitValues: { [mode]: { [ME]: mode === 'shares' ? '0002.0000' : '00100.00' } } }
          : {}),
        description: 'Lunch',
        amountText: '000100.00',
        currency: 'JPY',
        rateText: '0.2156789012345',
        rateSource: 'reference',
        rateDate: '2026-10-07',
        category: 'food',
        date: '2026-10-08',
        payerId: ME,
        memberIds: [ME],
      },
    });
    const preview = {
      ledger,
      amount: 21.57,
      originalAmount: 100,
      currency: 'JPY',
      exchangeRate: 0.2156789012345,
      ...(mode !== 'legacy' ? { splitMode: mode } : {}),
      splits: [
        {
          userId: ME,
          displayName: 'Me',
          shareAmount: 21.57,
          ...(mode !== 'legacy' ? { originalShareAmount: 100 } : {}),
        },
      ],
    };
    let cleanup: (() => void)[] = [];
    afterEach(() => {
      cleanup.forEach((fn) => fn());
      cleanup = [];
    });
    async function fixture() {
      const dir = mkdtempSync(join(tmpdir(), 'tb-g2b-'));
      const file = join(dir, 'pending.db');
      let db = memoryDatabase(file);
      let store = await createPendingExpenseStore(db);
      const server = fakeExpenseServer();
      server.addAccount(ME, 'me');
      server.addAccount(OTHER, 'other');
      server.addMember(TRIP, ME);
      let token: string | null = null;
      const manager = new SessionManager(
        new ApiClient('https://test', server.fetcher),
        {
          get: async () => token,
          set: async (v) => {
            token = v;
          },
          clear: async () => {
            token = null;
          },
        },
        async () => {}
      );
      await manager.login('me', 'password');
      const scope = { environment: manager.api.environment, accountId: ME };
      const engine = () =>
        new ExpenseEntry({
          store: async () => store,
          request: (id, path, schema, opts) => manager.requestAs(id, path, schema, opts),
          newId: () => uuidOf(100),
        });
      cleanup.push(() => {
        db.close();
        rmSync(dir, { recursive: true, force: true });
      });
      return {
        scope,
        server,
        manager,
        engine,
        get store() {
          return store;
        },
        get db() {
          return db;
        },
        async restart() {
          db.close();
          db = memoryDatabase(file);
          store = await createPendingExpenseStore(db);
        },
      };
    }
    it('retains incomplete raw foreign strings, provenance and precision after reopen without new defaults', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      d.input.rateText = '0.00';
      d.input.amountText = '00012.';
      if (mode !== 'legacy')
        d.input.splitValues = {
          amount: { [ME]: '00020.', [OTHER]: '0' },
          percent: { [ME]: '33.33' },
          shares: { [ME]: '', [OTHER]: '0002.0000' },
        };
      await h.store.drafts.start(d);
      await h.restart();
      expect(await h.store.drafts.load(h.scope, TRIP)).toEqual(d);
      expect(
        newDraft(
          {
            ...options,
            currencySettings: { default_currency: 'USD', currencies: [{ code: 'JPY', rate: 9 }] },
          },
          ME,
          '2026-10-08'
        ).currency
      ).toBe('USD');
      expect((await h.store.drafts.load(h.scope, TRIP))!.input).toEqual(d.input);
    });
    it('reads legacy draft/pending bodies unchanged alongside foreign requests in schema 8', async () => {
      const h = await fixture();
      const legacyDraft = {
        ...draft(h.scope),
        tripId: hex(101),
        input: {
          description: 'legacy',
          amountText: '100',
          category: 'food' as const,
          date: '2026-10-08',
          payerId: ME,
          memberIds: [ME],
        },
      };
      await h.store.drafts.start(legacyDraft);
      const legacy = {
        client_request_id: uuidOf(101),
        payer_id: ME,
        original_amount: 100,
        currency: 'TWD',
        exchange_rate: 1,
        description: 'legacy',
        category: 'food' as const,
        date: '2026-10-08',
        splits: [{ user_id: ME, share_amount: 100 }],
      };
      await insertLegacyPending(h.db, { ...h.scope, tripId: hex(102), payload: legacy });
      const raw = await h.db.getFirstAsync<{ payload: string }>(
        'SELECT payload FROM pending_expense'
      );
      await h.restart();
      expect(await h.store.drafts.load(h.scope, hex(101))).toEqual(legacyDraft);
      expect((await h.store.get(h.scope, legacy.client_request_id))!.payload).toEqual(legacy);
      expect(await h.db.getFirstAsync('SELECT payload FROM pending_expense')).toEqual(raw);
      expect(await h.db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 10 });
    });
    it('crash after draft handoff retains original UUID/body and never reapplies settings on retry', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      await h.store.drafts.start(d);
      const body = {
        ...confirmedFields(d.input, options, preview),
        client_request_id: uuidOf(100),
      };
      await h.store.insert(
        {
          ...h.scope,
          tripId: TRIP,
          clientRequestId: body.client_request_id,
          apiVersion: 2,
          payload: body,
          status: 'sending',
          createdAt: 1000,
          updatedAt: 1000,
        },
        d
      );
      await h.restart();
      await expect(h.store.drafts.load(h.scope, TRIP)).rejects.toThrow('DRAFT_HANDED_OFF');
      expect((await h.store.get(h.scope, body.client_request_id))!.payload).toEqual(body);
      expect((await h.engine().lookup(h.scope, body.client_request_id)).kind).toBe('unconfirmed');
      const saved = await h.engine().retry(h.scope, body.client_request_id);
      expect(saved).toMatchObject({
        kind: 'saved',
        differs: false,
        expense: {
          amount: 21.57,
          currency: 'JPY',
          exchangeRate: preview.exchangeRate,
          originalAmount: 100,
        },
      });
      expect(h.server.expenses).toHaveLength(1);
      expect(h.server.posts()[0].body).toEqual(body);
    });
    it('lost POST and lookup responses recover from receipt after restart with only one expense', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      await h.store.drafts.start(d);
      h.server.fail('POST', /\/expenses$/, { kind: 'drop-response' });
      // The check before sending passes; the lookup after the lost answer is lost too.
      h.server.fail('GET', /expense-requests/, { kind: 'pass' });
      h.server.fail('GET', /expense-requests/, { kind: 'drop-response' });
      const first = await h
        .engine()
        .submit(h.scope, TRIP, confirmedFields(d.input, options, preview), d);
      expect(first.kind).toBe('unconfirmed');
      expect(h.server.expenses).toHaveLength(1);
      await h.restart();
      expect(await h.store.list({ ...h.scope, accountId: OTHER })).toEqual([]);
      expect(await h.store.list({ ...h.scope, environment: 'https://other' })).toEqual([]);
      const result = await h.engine().lookup(h.scope, uuidOf(100));
      expect(result).toMatchObject({ kind: 'saved', differs: false });
      expect(h.server.posts()).toHaveLength(1);
      expect(await h.store.list(h.scope)).toEqual([]);
    });
    it('storage failure rolls back foreign handoff and never sends; definite rejection restores raw fields', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      await h.store.drafts.start(d);
      const bad: SqlDatabase = {
        ...h.db,
        runAsync: async (sql, ...args) => {
          if (/INSERT INTO pending_expense/.test(sql)) throw new Error('disk full');
          return h.db.runAsync(sql, ...args);
        },
      };
      const broken = await createPendingExpenseStore(bad);
      const entry = new ExpenseEntry({
        store: async () => broken,
        request: (id, path, schema, opts) => h.manager.requestAs(id, path, schema, opts),
        newId: () => uuidOf(100),
      });
      expect(
        (await entry.submit(h.scope, TRIP, confirmedFields(d.input, options, preview), d)).kind
      ).toBe('not-sent');
      expect(h.server.posts()).toHaveLength(0);
      expect(await h.store.drafts.load(h.scope, TRIP)).toEqual(d);
      h.server.fail('POST', /\/expenses$/, {
        kind: 'status',
        status: 400,
        code: 'VALIDATION_ERROR',
        receipt: true,
      });
      expect(
        (await h.engine().submit(h.scope, TRIP, confirmedFields(d.input, options, preview), d)).kind
      ).toBe('rejected');
      expect(await h.store.drafts.load(h.scope, TRIP)).toEqual({ ...d, revision: d.revision + 1 });
    });
    it('foreign pending respects durable 429 after restart; original amount/rate differences are detected', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      h.server.fail('POST', /\/expenses$/, {
        kind: 'status',
        status: 429,
        retryAfter: 120,
      });
      await h.engine().submit(h.scope, TRIP, confirmedFields(d.input, options, preview));
      await h.restart();
      expect((await h.engine().retry(h.scope, uuidOf(100))).kind).toBe('unconfirmed');
      expect(h.server.posts()).toHaveLength(1);
      const payload = (await h.store.get(h.scope, uuidOf(100)))!.payload;
      const detail = {
        id: hex(99),
        description: payload.description,
        date: payload.date,
        category: payload.category,
        payerId: ME,
        payerName: 'Me',
        amount: 21.57,
        originalAmount: 100,
        currency: 'JPY',
        exchangeRate: preview.exchangeRate,
        splits: preview.splits,
      };
      expect(sameExpense(payload, detail)).toBe(true);
      expect(sameExpense(payload, { ...detail, exchangeRate: preview.exchangeRate + 1e-12 })).toBe(
        false
      );
      expect(sameExpense(payload, { ...detail, originalAmount: 99 })).toBe(false);
      expect(sameExpense(payload, { ...detail, currency: 'USD' })).toBe(false);
    });
    it('sign-out and revoked membership keep the frozen foreign body for the original account', async () => {
      const h = await fixture();
      h.server.fail('POST', /\/expenses$/, { kind: 'drop-response' });
      // The check before sending passes; the lookup after the lost answer is lost too.
      h.server.fail('GET', /expense-requests/, { kind: 'pass' });
      h.server.fail('GET', /expense-requests/, { kind: 'drop-response' });
      await h
        .engine()
        .submit(h.scope, TRIP, confirmedFields(draft(h.scope).input, options, preview));
      await h.manager.login('other', 'password');
      expect((await h.engine().retry(h.scope, uuidOf(100))).kind).toBe('unconfirmed');
      expect(h.server.posts()).toHaveLength(1);
      await h.manager.login('me', 'password');
      h.server.removeMember(TRIP, ME);
      expect((await h.engine().retry(h.scope, uuidOf(100))).kind).toBe('unconfirmed');
      expect((await h.store.get(h.scope, uuidOf(100)))!.payload.exchange_rate).toBe(
        preview.exchangeRate
      );
      expect(h.server.expenses).toHaveLength(1);
    });
    it('revocation during async handoff stops POST but leaves one frozen request under C', async () => {
      const h = await fixture();
      const d = draft(h.scope);
      await h.store.drafts.start(d);
      let authorized = true;
      const guardedStore = {
        ...h.store,
        insert: async (...args: Parameters<typeof h.store.insert>) => {
          await h.store.insert(...args);
          authorized = false;
        },
      };
      const entry = new ExpenseEntry({
        store: async () => guardedStore,
        request: (id, path, schema, opts) => h.manager.requestAs(id, path, schema, opts),
        newId: () => uuidOf(100),
      });
      const result = await entry.submit(
        h.scope,
        TRIP,
        confirmedFields(d.input, options, preview),
        d,
        () => {
          if (!authorized) throw new Error('ACCESS_REVOKED');
        }
      );
      expect(result.kind).toBe('unconfirmed');
      expect(h.server.posts()).toHaveLength(0);
      expect((await h.store.list(h.scope))[0].payload.exchange_rate).toBe(preview.exchangeRate);
      await expect(h.store.drafts.load(h.scope, TRIP)).rejects.toThrow('DRAFT_HANDED_OFF');
    });
  }
);
