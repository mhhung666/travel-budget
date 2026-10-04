import { describe, expect, it } from 'vitest';
import type { ExpensePreview } from '@/api/contracts';
import {
  currentPreview,
  initialPreview,
  isPreviewing,
  isStalePreview,
  previewFailure,
  previewReducer,
  type PreviewAction,
  type PreviewState,
} from './previewState';

const share = (amount: number): ExpensePreview => ({
  amount,
  splits: [{ userId: 'a'.repeat(24), displayName: 'Ann', shareAmount: amount }],
});
const run = (actions: PreviewAction[], from: PreviewState = initialPreview) =>
  actions.reduce(previewReducer, from);

describe('preview state', () => {
  it('shows a preview only for the amount and members it was computed for', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'resolve', ticket: 1, key: '100|a', value: share(100) },
    ]);
    expect(currentPreview(state, '100|a')).toEqual(share(100));
    expect(isStalePreview(state, '100|a')).toBe(false);
    // The user changed the amount: the old preview is gone at once, with no event needed.
    expect(currentPreview(state, '101|a')).toBeNull();
    expect(isStalePreview(state, '101|a')).toBe(true);
    // Changing it back makes the same preview valid again, because it was computed for that input.
    expect(currentPreview(state, '100|a')).toEqual(share(100));
  });

  it('is never stale before the first preview', () => {
    expect(isStalePreview(initialPreview, '100|a')).toBe(false);
    expect(currentPreview(initialPreview, '100|a')).toBeNull();
    expect(currentPreview(initialPreview, null)).toBeNull();
  });

  it('keeps the newest request when answers arrive out of order', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'start', ticket: 2, key: '200|a' },
      { type: 'resolve', ticket: 2, key: '200|a', value: share(200) },
      { type: 'resolve', ticket: 1, key: '100|a', value: share(100) }, // the slow, older answer
    ]);
    expect(state.preview).toEqual({ key: '200|a', value: share(200) });
    expect(currentPreview(state, '200|a')).toEqual(share(200));
    expect(currentPreview(state, '100|a')).toBeNull();
    expect(state.running).toBeNull();
  });

  it('does not let an older failure replace a newer request or its preview', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'start', ticket: 2, key: '200|a' },
      { type: 'reject', ticket: 1, key: '100|a', error: new Error('late') },
      { type: 'resolve', ticket: 2, key: '200|a', value: share(200) },
    ]);
    expect(state.failure).toBeNull();
    expect(currentPreview(state, '200|a')).toEqual(share(200));
  });

  it('reports a request as running only for the input it was made for', () => {
    const state = run([{ type: 'start', ticket: 1, key: '100|a' }]);
    expect(isPreviewing(state, '100|a')).toBe(true);
    expect(isPreviewing(state, '101|a')).toBe(false); // edited while waiting
    const done = previewReducer(state, {
      type: 'resolve',
      ticket: 1,
      key: '100|a',
      value: share(100),
    });
    expect(isPreviewing(done, '100|a')).toBe(false);
  });

  it('never leaves a stuck spinner when an older request finishes after a newer one started', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'start', ticket: 2, key: '100|a' },
      { type: 'abandon', ticket: 1 },
    ]);
    expect(isPreviewing(state, '100|a')).toBe(true); // ticket 2 is still running
    expect(isPreviewing(previewReducer(state, { type: 'abandon', ticket: 2 }), '100|a')).toBe(
      false
    );
  });

  it('shows a failure only for the input it happened with, and clears it on the next request', () => {
    const error = new Error('offline');
    let state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'reject', ticket: 1, key: '100|a', error },
    ]);
    expect(previewFailure(state, '100|a')).toBe(error);
    expect(previewFailure(state, '101|a')).toBeNull();
    state = previewReducer(state, { type: 'start', ticket: 2, key: '100|a' });
    expect(previewFailure(state, '100|a')).toBeNull();
  });

  it('discards the previous preview as soon as a new request starts, whatever its answer', () => {
    const shown = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'resolve', ticket: 1, key: '100|a', value: share(100) },
    ]);
    expect(currentPreview(shown, '100|a')).toEqual(share(100));
    const asked = previewReducer(shown, { type: 'start', ticket: 2, key: '100|a' });
    // Nothing can be confirmed while the new answer is awaited ...
    expect(currentPreview(asked, '100|a')).toBeNull();
    expect(asked.preview).toBeNull();
    // ... and nothing when that answer is a refusal, as after access to the trip was revoked.
    const error = new Error('not found');
    const refused = previewReducer(asked, { type: 'reject', ticket: 2, key: '100|a', error });
    expect(currentPreview(refused, '100|a')).toBeNull();
    expect(isStalePreview(refused, '100|a')).toBe(false);
    expect(previewFailure(refused, '100|a')).toBe(error);
    // A slow answer to the first request cannot bring the old split back either.
    const late = previewReducer(refused, {
      type: 'resolve',
      ticket: 1,
      key: '100|a',
      value: share(100),
    });
    expect(currentPreview(late, '100|a')).toBeNull();
  });

  it('forgets the preview after the server refused the confirmed request', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'resolve', ticket: 1, key: '100|a', value: share(100) },
      { type: 'clear', ticket: 2 },
    ]);
    expect(currentPreview(state, '100|a')).toBeNull();
    expect(isStalePreview(state, '100|a')).toBe(false);
  });

  it('drops everything when the input changes, including an answer still on its way', () => {
    const state = run([
      { type: 'start', ticket: 1, key: '100|a' },
      { type: 'resolve', ticket: 1, key: '100|a', value: share(100) },
      { type: 'start', ticket: 2, key: '100|a' },
      { type: 'clear', ticket: 3 }, // the amount was edited while request 2 was in flight
      { type: 'resolve', ticket: 2, key: '100|a', value: share(100) },
    ]);
    expect(state.preview).toBeNull();
    expect(state.running).toBeNull();
    expect(currentPreview(state, '100|a')).toBeNull();
    // Editing the amount back does not bring the old preview back: it has to be asked for again.
    expect(isStalePreview(state, '100|a')).toBe(false);
  });
});
