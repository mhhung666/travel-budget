import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/features/auth/AuthProvider';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: false },
          mutations: { retry: false },
        },
      })
  );
  useEffect(() => {
    const focus = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    });
    let alive = true;
    const update = (state: Network.NetworkState) => {
      if (alive)
        onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    };
    const network = Network.addNetworkStateListener(update);
    void Network.getNetworkStateAsync()
      .then(update)
      .catch(() => {});
    return () => {
      alive = false;
      focus.remove();
      network.remove();
    };
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
