import { useLocalSearchParams } from 'expo-router';
import { EditExpenseScreen } from '@/features/expenses/EditExpenseScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function EditRoute() {
  const { id, expenseId, remove, source } = useLocalSearchParams<{
    id: string;
    expenseId: string;
    remove: string;
    source: string;
  }>();
  const { manager, user } = useAuth();
  return (
    <EditExpenseScreen
      key={`${manager.api.environment}:${user?.id}:${id}:${expenseId}:${remove}:${source}`}
      tripId={id}
      expenseId={expenseId}
      remove={remove === 'true'}
      source={source}
    />
  );
}
