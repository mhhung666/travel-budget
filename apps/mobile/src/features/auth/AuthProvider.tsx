import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClient, validateBaseUrl } from '@/api/client';
import { SessionManager } from '@/api/session';
import { createCredentialStore } from '@/storage/credentials';

const AuthContext = createContext<SessionManager | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const cache = useQueryClient();
  const [manager] = useState(() => {
    let baseUrl = '';
    try {
      baseUrl = validateBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, __DEV__);
    } catch {
      /* login presents a localized setup error */
    }
    return new SessionManager(new ApiClient(baseUrl), createCredentialStore(baseUrl), async () => {
      await cache.cancelQueries();
      cache.clear();
    });
  });
  useEffect(() => {
    void manager.restore();
  }, [manager]);
  return <AuthContext.Provider value={manager}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const manager = useContext(AuthContext);
  if (!manager) throw new Error('AuthProvider is missing');
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
  return { ...state, manager };
}
