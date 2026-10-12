import { idSchema } from '@travel-budget/contracts';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { openLastExpenseTripStore } from '@/storage/expenseTripPreference';

export function useLastExpenseTrip() {
  const { manager, user } = useAuth();
  const version = manager.getSignInVersion();
  const owner = JSON.stringify([manager.api.environment, user?.id, version]);
  const [value, setValue] = useState<{ owner: string; id: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (user) {
      const scope = { environment: manager.api.environment, accountId: user.id };
      void openLastExpenseTripStore()
        .then((store) => store.read(scope))
        .then((id) => {
          if (
            active &&
            manager.getSignInVersion() === version &&
            manager.getSnapshot().user?.id === scope.accountId
          )
            setValue({ owner, id: idSchema.safeParse(id).success ? id : null });
        })
        .catch(() => {}); // Optional preference failure never blocks entry or invents a choice.
    }
    return () => {
      active = false;
    };
  }, [manager, user, version, owner]);
  return value?.owner === owner ? value.id : null;
}
