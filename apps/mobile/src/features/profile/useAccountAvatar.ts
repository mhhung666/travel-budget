import { useQuery } from '@tanstack/react-query';
import { avatarContextSchema } from '@travel-budget/contracts';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError } from '@/api/client';
export function useAccountAvatar() {
  const { manager, user, status } = useAuth();
  const version = manager.getSignInVersion(),
    accountId = user?.id ?? '';
  const queryKey = [manager.api.environment, accountId, 'account-avatar', version, 'v2'];
  const query = useQuery({
    queryKey,
    enabled: status === 'signedIn' && !!accountId,
    queryFn: ({ signal }) =>
      manager.requestAs(accountId, '/me/avatar', avatarContextSchema, {
        signal,
        beforeSend: () => {
          if (manager.getSignInVersion() !== version) throw new ApiError('CANCELLED');
        },
      }),
  });
  return { ...query, queryKey };
}
