import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { ExpenseOptions } from '@/api/contracts';
import { localDate } from '@/i18n/format';
import { openPendingExpenseStore } from '@/storage/pendingExpenseDatabase';
import type { PendingScope } from '@/storage/pendingExpenses';
import { newDraft } from './draft';
import { DraftEditor } from './draftEditor';

export function useExpenseDraft(scope: PendingScope, tripId: string, options: ExpenseOptions) {
  const [editor] = useState(
    () =>
      new DraftEditor({
        store: openPendingExpenseStore,
        scope,
        tripId,
        initial: () => newDraft(options, scope.accountId, localDate()),
        newId: () => Crypto.randomUUID(),
      })
  );
  useLayoutEffect(() => {
    // Refresh defaults after commit without rewriting the draft being edited.
    editor.setInitial(() => newDraft(options, scope.accountId, localDate()));
  }, [editor, options, scope.accountId]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void editor.initialize();
    }
    const flush = () => {
      void editor.flush().catch(() => undefined);
    };
    const subscription = AppState.addEventListener('change', (value) => {
      if (value !== 'active') flush();
    });
    return () => {
      subscription.remove();
      flush();
    };
  }, [editor]);
  return { editor, state };
}
