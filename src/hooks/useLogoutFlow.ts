'use client';

import { useCallback } from 'react';
import { logout } from '@/actions';
import { useQueryPersistenceControls } from '@/components/providers/QueryProvider';

/** Clear private client state before rebuilding the app with an anonymous cache scope. */
export function useLogoutFlow(pendingMutationMessage: string) {
  const { clearForLogout, hasPausedMutations } = useQueryPersistenceControls();

  return useCallback(async (): Promise<boolean> => {
    if (hasPausedMutations() && !window.confirm(pendingMutationMessage)) return false;

    const result = await logout();
    if (!result.success) throw new Error(result.error);

    try {
      await clearForLogout();
    } finally {
      // The server session is already gone. Never leave private UI mounted if
      // IndexedDB cleanup itself fails; the guest scope cannot restore it.
      window.location.assign('/login');
    }
    return true;
  }, [clearForLogout, hasPausedMutations, pendingMutationMessage]);
}
