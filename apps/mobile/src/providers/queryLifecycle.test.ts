import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusManager, onlineManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AppStateStatus } from 'react-native';
import type { NetworkState } from 'expo-network';
import { subscribeQueryLifecycle } from './queryLifecycle';

const native = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  appState: {
    currentState: 'active' as string | null,
    addEventListener: vi.fn(),
  },
  readNetwork: vi.fn(),
  listenNetwork: vi.fn(),
}));
vi.mock('react-native', () => ({ AppState: native.appState, Platform: native.platform }));
vi.mock('expo-network', () => ({
  getNetworkStateAsync: native.readNetwork,
  addNetworkStateListener: native.listenNetwork,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => (resolve = complete));
  return { promise, resolve };
}
let appEvent: (state: AppStateStatus) => void;
let networkEvent: (state: NetworkState) => void;
let stop: () => void;
const removeFocus = vi.fn();
const removeNetwork = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  native.platform.OS = 'ios';
  native.appState.currentState = 'active';
  native.readNetwork.mockResolvedValue({ isConnected: true });
  native.appState.addEventListener.mockImplementation((_event, listener) => {
    appEvent = listener;
    return { remove: removeFocus };
  });
  native.listenNetwork.mockImplementation((listener) => {
    networkEvent = listener;
    return { remove: removeNetwork };
  });
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
});
afterEach(() => {
  stop?.();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});

describe('native query lifecycle', () => {
  it.each([true, false])(
    'keeps the latest network event when startup reports %s late',
    async (initial) => {
      const snapshot = deferred<NetworkState>();
      native.readNetwork.mockReturnValueOnce(snapshot.promise);
      stop = subscribeQueryLifecycle();
      networkEvent({ isConnected: !initial });
      snapshot.resolve({ isConnected: initial });
      await snapshot.promise;
      expect(onlineManager.isOnline()).toBe(!initial);
    }
  );

  it('rereads connectivity on foreground without letting an older read overwrite it', async () => {
    const startup = deferred<NetworkState>();
    const foreground = deferred<NetworkState>();
    native.readNetwork.mockReturnValueOnce(startup.promise).mockReturnValueOnce(foreground.promise);
    stop = subscribeQueryLifecycle();
    appEvent('background');
    appEvent('active');
    foreground.resolve({ isConnected: false });
    await foreground.promise;
    startup.resolve({ isConnected: true });
    await startup.promise;
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('starts unfocused when mounted in the background and leaves web focus to the browser', () => {
    native.appState.currentState = 'background';
    stop = subscribeQueryLifecycle();
    expect(focusManager.isFocused()).toBe(false);
    appEvent('active');
    expect(focusManager.isFocused()).toBe(true);
    stop();
    native.platform.OS = 'web';
    stop = subscribeQueryLifecycle();
    appEvent('background');
    expect(focusManager.isFocused()).toBe(true);
  });

  it('preserves the last known state if the native network read fails', async () => {
    native.readNetwork.mockRejectedValue(new Error('native unavailable'));
    onlineManager.setOnline(false);
    stop = subscribeQueryLifecycle();
    await Promise.resolve();
    expect(onlineManager.isOnline()).toBe(false);
    networkEvent({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    networkEvent({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('ignores late native callbacks and snapshots after cleanup', async () => {
    const snapshot = deferred<NetworkState>();
    native.readNetwork.mockReturnValueOnce(snapshot.promise);
    stop = subscribeQueryLifecycle();
    stop();
    appEvent('background');
    networkEvent({ isConnected: false });
    snapshot.resolve({ isConnected: false });
    await snapshot.promise;
    expect(focusManager.isFocused()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
    expect(removeFocus).toHaveBeenCalledOnce();
    expect(removeNetwork).toHaveBeenCalledOnce();
  });

  it.each(['foreground', 'reconnect'] as const)(
    'refreshes stale observed data after %s while preserving cached data',
    async (trigger) => {
      const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      cache.mount();
      stop = subscribeQueryLifecycle();
      await Promise.resolve();
      const key = ['test-api', 'account-a', 'trip'];
      cache.setQueryData(key, 'cached summary', { updatedAt: Date.now() - 31_000 });
      if (trigger === 'foreground') appEvent('background');
      else networkEvent({ isConnected: false });
      const response = deferred<string>();
      const fetch = vi.fn(() => response.promise);
      const observer = new QueryObserver(cache, {
        queryKey: key,
        queryFn: fetch,
        staleTime: 30_000,
        refetchOnMount: false,
      });
      const unsubscribe = observer.subscribe(() => {});
      try {
        expect(fetch).not.toHaveBeenCalled();
        if (trigger === 'foreground') appEvent('active');
        else networkEvent({ isConnected: true });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        expect(observer.getCurrentResult().data).toBe('cached summary');
        response.resolve('updated summary');
        await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('updated summary'));
      } finally {
        response.resolve('updated summary');
        unsubscribe();
        cache.unmount();
        cache.clear();
      }
    }
  );

  it('resumes a first query paused offline when connectivity returns', async () => {
    native.readNetwork.mockResolvedValue({ isConnected: false });
    const cache = new QueryClient();
    cache.mount();
    stop = subscribeQueryLifecycle();
    await Promise.resolve();
    const fetch = vi.fn(async () => 'first summary');
    const observer = new QueryObserver(cache, { queryKey: ['uncached-trip'], queryFn: fetch });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(observer.getCurrentResult().fetchStatus).toBe('paused');
      expect(fetch).not.toHaveBeenCalled();
      networkEvent({ isConnected: true });
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('first summary'));
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      unsubscribe();
      cache.unmount();
      cache.clear();
    }
  });
});
