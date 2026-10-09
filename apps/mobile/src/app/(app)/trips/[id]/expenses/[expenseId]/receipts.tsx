import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReceiptsScreen } from '@/features/expenses/ReceiptsScreen';
export default function ReceiptsRoute() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const { user, manager } = useAuth();
  return (
    <ReceiptsScreen
      key={`${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}:${id}:${expenseId}`}
      tripId={id}
      expenseId={expenseId}
    />
  );
}
