import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';

/** Keep Query in sync with native events, including changes missed in the background. */
export function subscribeQueryLifecycle() {
  let alive = true;
  let revision = 0;
  const updateNetwork = (state: Network.NetworkState) => {
    onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  };
  const readNetwork = () => {
    const started = ++revision;
    void Network.getNetworkStateAsync()
      .then((state) => {
        // An event or a later foreground read is newer than this snapshot.
        if (alive && started === revision) updateNetwork(state);
      })
      .catch(() => {});
  };
  const network = Network.addNetworkStateListener((state) => {
    if (!alive) return;
    revision++;
    updateNetwork(state);
  });
  if (Platform.OS !== 'web' && AppState.currentState !== null)
    focusManager.setFocused(AppState.currentState === 'active');
  const focus = AppState.addEventListener('change', (state) => {
    if (!alive) return;
    if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    if (state === 'active') readNetwork();
  });
  readNetwork();
  return () => {
    alive = false;
    focus.remove();
    network.remove();
  };
}
