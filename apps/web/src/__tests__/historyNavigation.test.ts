import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { initializeHistoryNavigation, retainHistoryNavigation } from '@/lib/historyNavigation';

let tracking: ReturnType<typeof retainHistoryNavigation>;
let unblock: (() => void) | undefined;
const router = vi.fn();
beforeEach(() => {
  history.replaceState({ __NA: true, tree: 'initial' }, '', '/history-start');
  tracking = retainHistoryNavigation();
  window.addEventListener('popstate', router);
});
afterEach(() => {
  unblock?.();
  unblock = undefined;
  tracking.release();
  window.removeEventListener('popstate', router);
  vi.clearAllMocks();
});
async function go(delta: number, path: string) {
  history.go(delta);
  await waitFor(() => expect(location.pathname).toBe(path));
}
it.each([-2, -1, 1, 2])(
  'cancels a signed %i-entry traversal and hides both popstates from the router',
  async (delta) => {
    history.pushState({ __NA: true, tree: 'one' }, '', '/one');
    history.pushState({ __NA: true, tree: 'two' }, '', '/two');
    history.pushState({ __NA: true, tree: 'three' }, '', '/three');
    history.pushState({ __NA: true, tree: 'four' }, '', '/four');
    if (delta > 0) await go(-2, '/two');
    const origin = location.href;
    const state = structuredClone(history.state);
    const length = history.length;
    router.mockClear();
    const allow = vi.fn(() => false);
    unblock = tracking.block(allow);
    const compensation = vi.spyOn(history, 'go');
    history.go(delta);
    await waitFor(() => expect(allow).toHaveBeenCalledOnce());
    await waitFor(() => expect(location.href).toBe(origin));
    expect(history.state).toEqual(state);
    expect(history.length).toBe(length);
    expect(compensation.mock.calls).toEqual([[delta], [-delta]]);
    expect(router).not.toHaveBeenCalled();
    compensation.mockRestore();
    // The restored history position really is the original entry: accepting
    // the same traversal now lands at its original target, without extra entries.
    unblock();
    unblock = undefined;
    await go(
      delta,
      delta > 0 ? (delta === 1 ? '/three' : '/four') : delta === -1 ? '/three' : '/two'
    );
    expect(router).toHaveBeenCalledOnce();
  }
);
it('distinguishes repeated URLs and keeps custom/router state on replaceState', async () => {
  history.pushState({ __NA: true, tree: 'first' }, '', '/repeat');
  history.pushState({ __NA: true, tree: 'second' }, '', '/repeat');
  history.replaceState({ __NA: true, tree: 'replaced', custom: 42 }, '', '/repeat');
  const state = structuredClone(history.state);
  const allow = vi.fn(() => false);
  unblock = tracking.block(allow);
  history.back();
  await waitFor(() => expect(allow).toHaveBeenCalledOnce());
  await waitFor(() => expect(history.state).toEqual(state));
  expect(router).not.toHaveBeenCalled();
  expect(history.state).toMatchObject({ __NA: true, tree: 'replaced', custom: 42 });
});
it('tracks accepted traversals and pushes from a back position using the new branch', async () => {
  history.pushState({ __NA: true }, '', '/one');
  history.pushState({ __NA: true }, '', '/two');
  unblock = tracking.block(() => true);
  await go(-1, '/one');
  history.pushState({ __NA: true }, '', '/branch');
  unblock();
  const allow = vi.fn(() => false);
  unblock = tracking.block(allow);
  history.back();
  await waitFor(() => expect(allow).toHaveBeenCalledOnce());
  await waitFor(() => expect(location.pathname).toBe('/branch'));
  expect(router).toHaveBeenCalledOnce();
});
it('shares root tracking across guards, cleanup and re-mounts without losing old entries', async () => {
  history.pushState({ __NA: true }, '', '/before-selection');
  const page = retainHistoryNavigation();
  history.pushState({ __NA: true }, '', '/selected-page');
  const allow = vi.fn(() => false);
  const remove = page.block(allow);
  history.back();
  await waitFor(() => expect(allow).toHaveBeenCalledOnce());
  await waitFor(() => expect(location.pathname).toBe('/selected-page'));
  remove();
  page.release();
  await go(-1, '/before-selection');
  expect(router).toHaveBeenCalledOnce();
});
it('keeps one document tracker when Next wraps history methods and account providers remount', async () => {
  initializeHistoryNavigation();
  const push = history.pushState;
  const nextPush: History['pushState'] = function (state, title, url) {
    return push.call(history, { ...state, __NA: true }, title, url);
  };
  history.pushState = nextPush;
  try {
    history.pushState({ tree: 'old-account' }, '', '/old-account');
    // Mounting another account's QueryProvider must not wrap/reinitialize the
    // old tracker captured inside Next's patched method.
    initializeHistoryNavigation();
    expect(history.pushState).toBe(nextPush);
    history.pushState({ tree: 'new-account' }, '', '/new-account');
    const allow = vi.fn(() => false);
    unblock = tracking.block(allow);
    history.go(-2);
    await waitFor(() => expect(allow).toHaveBeenCalledOnce());
    await waitFor(() => expect(location.pathname).toBe('/new-account'));
    expect(history.state).toMatchObject({ __NA: true, tree: 'new-account' });
    expect(router).not.toHaveBeenCalled();
  } finally {
    history.pushState = push;
  }
});
