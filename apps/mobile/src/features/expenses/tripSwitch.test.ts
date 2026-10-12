import { expect, it } from 'vitest';
import { memoryDatabase } from '@/test/sqlite';
import { hex, uuidOf } from '@/test/expenseServer';
import { createPendingExpenseStore } from '@/storage/pendingExpenses';
import { newDraft } from './draft';
import { DraftEditor } from './draftEditor';
import { saveBeforeTripSwitch } from './tripSwitch';

it('saves raw input only under the original trip, ready to restore after switching back', async () => {
  const db = memoryDatabase();
  try {
    const store = await createPendingExpenseStore(db);
    const scope = { environment: 'env', accountId: hex(1) };
    const tripId = hex(2);
    const initial = () =>
      newDraft(
        { members: [{ id: hex(1), displayName: 'Me' }], categories: ['food'] },
        scope.accountId,
        '2026-10-12'
      );
    const editor = new DraftEditor({
      store: async () => store,
      scope,
      tripId,
      initial,
      newId: () => uuidOf(1),
    });
    await editor.initialize();
    editor.edit({
      ...editor.getSnapshot().record!.input,
      amountText: '00012.',
      description: 'unfinished',
    });
    await saveBeforeTripSwitch(editor, () => true);
    const saved = await store.drafts.load(scope, tripId);
    expect(saved?.input.amountText).toBe('00012.');
    expect(saved?.input.description).toBe('unfinished');
    expect(await store.drafts.load(scope, hex(3))).toBeNull();
    const restored = new DraftEditor({
      store: async () => store,
      scope,
      tripId,
      initial,
      newId: () => uuidOf(2),
    });
    await restored.initialize();
    expect(restored.getSnapshot().phase).toBe('choice');
    restored.restore();
    expect(restored.getSnapshot().record).toEqual(saved);
    await expect(saveBeforeTripSwitch(editor, () => false)).rejects.toThrow('CANCELLED');
  } finally {
    db.close();
  }
});
