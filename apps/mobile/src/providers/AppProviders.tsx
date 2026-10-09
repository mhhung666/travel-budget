import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PreferencesProvider } from '@/features/preferences/PreferencesProvider';
import { AppAppearance } from '@/features/preferences/AppAppearance';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { DraftCatalogProvider } from '@/features/localDrafts/provider';
import { TripEntryProvider } from '@/features/tripEntry/provider';
import { ExpenseEntryProvider } from '@/features/expenses/entryProvider';
import { subscribeQueryLifecycle } from './queryLifecycle';

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
  useEffect(subscribeQueryLifecycle, []);
  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <AppAppearance>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <DraftCatalogProvider>
                <ExpenseEntryProvider>
                  <TripEntryProvider>{children}</TripEntryProvider>
                </ExpenseEntryProvider>
              </DraftCatalogProvider>
            </AuthProvider>
          </QueryClientProvider>
        </AppAppearance>
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}
