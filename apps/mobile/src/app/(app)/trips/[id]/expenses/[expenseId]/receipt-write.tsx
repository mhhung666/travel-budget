import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { ReceiptWriteScreen } from '@/features/expenses/ReceiptWriteScreen';
export default function ReceiptWriteRoute() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  const { user, manager } = useAuth();
  return (
    <ReceiptWriteScreen
      key={`${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}:${id}:${expenseId}`}
      tripId={id}
      expenseId={expenseId}
    />
  );
}
