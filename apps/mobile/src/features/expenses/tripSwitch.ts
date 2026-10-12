import type { DraftEditor } from './draftEditor';

/** Switching never transfers input to a different trip; wait for the original draft to save. */
export async function saveBeforeTripSwitch(editor: DraftEditor, current: () => boolean) {
  if (!current()) throw new Error('CANCELLED');
  const saved = await editor.flush();
  const state = editor.getSnapshot();
  if (
    !current() ||
    state.phase !== 'editing' ||
    state.status !== 'saved' ||
    state.record?.draftId !== saved.draftId ||
    state.record.revision !== saved.revision
  )
    throw new Error('DRAFT_CHANGED');
  return saved;
}
