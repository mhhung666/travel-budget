import { afterEach, describe, expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { hex, uuidOf } from '@/test/expenseServer';
import { createPendingExpenseStore, type PendingScope } from '@/storage/pendingExpenses';
import type { ExpenseDraft } from '@/storage/expenseDrafts';
import { DraftEditor } from './draftEditor';

const scope = { environment: 'https://a.test', accountId: hex(1) };
const tripId = hex(100);
const initial = (): ExpenseDraft => ({
  description: '',
  amountText: '',
  date: '2026-10-05',
  category: 'food',
  payerId: hex(1),
  memberIds: [hex(1)],
});
const opened: { close(): void }[] = [];
afterEach(() => opened.splice(0).forEach((db) => db.close()));
async function harness() {
  const db = memoryDatabase();
  opened.push(db);
  const store = await createPendingExpenseStore(db);
  let id = 10;
  const fail = { open: false, start: false, save: false, discard: false };
  const adapter = {
    ...store,
    drafts: {
      ...store.drafts,
      start: async (...args: Parameters<typeof store.drafts.start>) => {
        if (fail.start) throw new Error('disk full');
        return store.drafts.start(...args);
      },
      save: async (...args: Parameters<typeof store.drafts.save>) => {
        if (fail.save) throw new Error('disk full');
        return store.drafts.save(...args);
      },
      discard: async (...args: Parameters<typeof store.drafts.discard>) => {
        if (fail.discard) throw new Error('disk full');
        return store.drafts.discard(...args);
      },
    },
  };
  const editor = (account: PendingScope = scope) =>
    new DraftEditor({
      store: async () => {
        if (fail.open) throw new Error('disk unavailable');
        return adapter;
      },
      scope: account,
      tripId,
      initial,
      newId: () => uuidOf(++id),
    });
  return { store, editor, fail };
}
describe('draft saving and recovery state', () => {
  it('loads before enabling input and asks to resume without overwriting saved input', async () => {
    const h = await harness();
    const first = h.editor();
    await first.initialize();
    first.edit({ ...initial(), description: 'not finished', amountText: '0.' });
    await first.flush();
    const next = h.editor();
    expect(next.getSnapshot().phase).toBe('loading');
    next.edit({ ...initial(), description: 'must not override' });
    await next.initialize();
    expect(next.getSnapshot().phase).toBe('choice');
    next.restore();
    expect(next.getSnapshot()).toMatchObject({
      phase: 'editing',
      status: 'saved',
      record: { input: { description: 'not finished', amountText: '0.' } },
    });
  });
  it('queued rapid edits save the latest revision even after the screen unsubscribes', async () => {
    const h = await harness();
    const editor = h.editor();
    await editor.initialize();
    const stop = editor.subscribe(() => {});
    editor.edit({ ...initial(), description: 'a' });
    editor.edit({ ...initial(), description: 'ab' });
    editor.edit({ ...initial(), description: 'abc' });
    expect(editor.getSnapshot().status).toBe('saving');
    stop();
    await editor.flush();
    expect(editor.getSnapshot().status).toBe('saved');
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('abc');
  });
  it('immediate re-entry waits for the previous screen’s entire save queue before restoring', async () => {
    const h = await harness();
    const first = h.editor();
    await first.initialize();
    first.edit({ ...initial(), description: 'one' });
    first.edit({ ...initial(), description: 'two' });
    first.edit({ ...initial(), description: 'last' });
    const second = h.editor();
    await second.initialize();
    second.restore();
    expect(second.getSnapshot().record?.input.description).toBe('last');
  });
  it('failed saves stay in memory, report failure, block flush and can retry', async () => {
    const h = await harness();
    const editor = h.editor();
    await editor.initialize();
    h.fail.save = true;
    editor.edit({ ...initial(), description: 'new' });
    await expect(editor.flush()).rejects.toThrow('DRAFT_SAVE_FAILED');
    expect(editor.getSnapshot()).toMatchObject({
      status: 'failed',
      record: { input: { description: 'new' } },
    });
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('');
    h.fail.save = false;
    await editor.flush();
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('new');
  });
  it('initial storage failure preserves editable input and retry creates only its latest revision', async () => {
    const h = await harness();
    const editor = h.editor();
    // Opening failure before loading never enables a fresh editor that could overwrite a draft.
    h.fail.open = true;
    await editor.initialize();
    expect(editor.getSnapshot().phase).toBe('error');
    h.fail.open = false;
    await editor.initialize();
    h.fail.open = true;
    editor.edit({ ...initial(), amountText: '123.' });
    await expect(editor.flush()).rejects.toThrow();
    h.fail.open = false;
    await editor.flush();
    expect(editor.getSnapshot().status).toBe('saved');
  });
  it('failed initial writes retain raw input, show failure, and can be retried or discarded', async () => {
    const h = await harness();
    const editor = h.editor();
    h.fail.start = true;
    await editor.initialize();
    expect(editor.getSnapshot()).toMatchObject({ phase: 'editing', status: 'failed' });
    editor.edit({ ...initial(), description: 'not saved yet' });
    await expect(editor.flush()).rejects.toThrow();
    expect(await h.store.drafts.load(scope, tripId)).toBeNull();
    h.fail.start = false;
    await editor.flush();
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('not saved yet');
    await editor.discard();
    expect(editor.getSnapshot().record?.input.description).toBe('');
  });
  it('discard is explicit, leaves a new generation, and delayed edits cannot resurrect the old one', async () => {
    const h = await harness();
    const editor = h.editor();
    await editor.initialize();
    editor.edit({ ...initial(), description: 'discard me' });
    await editor.flush();
    const old = editor.getSnapshot().record!;
    const discarded = editor.discard();
    editor.edit({ ...initial(), description: 'late edit' });
    await discarded;
    await editor.flush();
    expect(editor.getSnapshot().record?.draftId).not.toBe(old.draftId);
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('');
  });
  it('failed discard preserves the original input and exposes a retryable error', async () => {
    const h = await harness();
    const editor = h.editor();
    await editor.initialize();
    editor.edit({ ...initial(), description: 'keep me' });
    await editor.flush();
    h.fail.discard = true;
    await editor.discard();
    expect(editor.getSnapshot()).toMatchObject({
      phase: 'editing',
      discardFailed: true,
      record: { input: { description: 'keep me' } },
    });
    h.fail.discard = false;
    await editor.discard();
    expect(editor.getSnapshot().record?.input.description).toBe('');
  });
  it('A → B → A shows only the current account, retaining A’s draft', async () => {
    const h = await harness();
    const a = h.editor();
    await a.initialize();
    a.edit({ ...initial(), description: 'account A' });
    await a.flush();
    const b = h.editor({ ...scope, accountId: hex(2) });
    await b.initialize();
    expect(b.getSnapshot().phase).toBe('editing');
    expect(b.getSnapshot().record?.input.description).toBe('');
    const restoredA = h.editor();
    await restoredA.initialize();
    restoredA.restore();
    expect(restoredA.getSnapshot().record?.input.description).toBe('account A');
  });
  it('closed editors never flush or save submitted input again', async () => {
    const h = await harness();
    const editor = h.editor();
    await editor.initialize();
    editor.close();
    editor.edit({ ...initial(), description: 'too late' });
    await expect(editor.flush()).rejects.toThrow('DRAFT_NOT_EDITING');
    expect((await h.store.drafts.load(scope, tripId))?.input.description).toBe('');
  });
});
