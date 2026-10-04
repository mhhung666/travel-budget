import type { ExpensePreview } from '@/api/contracts';

/**
 * The preview shown next to the form. Every request carries a ticket and only the newest ticket's
 * answer is kept, so a slow older answer can never replace a newer one. Everything shown is matched
 * against the key of the amount and members on screen *now*: after any change to them an older
 * preview, in-flight request or failure is simply no longer current, with nothing to clean up.
 * Asking again discards the preview at once: what can be confirmed is always the answer to the
 * latest request, so a refused or failed one (for instance after access to the trip was revoked)
 * never leaves an older split on screen to be confirmed.
 */
export interface PreviewState {
  ticket: number;
  running: { ticket: number; key: string } | null;
  preview: { key: string; value: ExpensePreview } | null;
  failure: { key: string; error: unknown } | null;
}
export type PreviewAction =
  | { type: 'start'; ticket: number; key: string }
  | { type: 'resolve'; ticket: number; key: string; value: ExpensePreview }
  | { type: 'reject'; ticket: number; key: string; error: unknown }
  /** The request was cancelled because the input changed; it leaves nothing behind. */
  | { type: 'abandon'; ticket: number }
  /** The amount or members changed, or the server refused the request: preview again from scratch. */
  | { type: 'clear'; ticket: number };

export const initialPreview: PreviewState = {
  ticket: 0,
  running: null,
  preview: null,
  failure: null,
};

export function previewReducer(state: PreviewState, action: PreviewAction): PreviewState {
  const finished = (ticket: number) => (state.running?.ticket === ticket ? null : state.running);
  switch (action.type) {
    case 'start':
      return {
        ticket: action.ticket,
        running: { ticket: action.ticket, key: action.key },
        preview: null,
        failure: null,
      };
    case 'resolve':
      return {
        ...state,
        running: finished(action.ticket),
        preview:
          action.ticket === state.ticket ? { key: action.key, value: action.value } : state.preview,
      };
    case 'reject':
      return {
        ...state,
        running: finished(action.ticket),
        failure:
          action.ticket === state.ticket ? { key: action.key, error: action.error } : state.failure,
      };
    case 'abandon':
      return { ...state, running: finished(action.ticket) };
    case 'clear':
      // Later than every request so far, so an answer still on its way is no longer accepted.
      return { ticket: action.ticket, running: null, preview: null, failure: null };
  }
}

/** The preview that belongs to the amount and members on screen, or null. */
export const currentPreview = (state: PreviewState, key: string | null) =>
  state.preview && state.preview.key === key ? state.preview.value : null;
/** There is a preview, but for different input. */
export const isStalePreview = (state: PreviewState, key: string | null) =>
  state.preview !== null && state.preview.key !== key;
export const isPreviewing = (state: PreviewState, key: string | null) =>
  state.running !== null && state.running.key === key;
export const previewFailure = (state: PreviewState, key: string | null) =>
  state.failure && state.failure.key === key ? state.failure.error : null;
