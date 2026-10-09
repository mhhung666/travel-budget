import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { ExpenseSearchScreen } from '@/features/expenses/ExpenseSearchScreen';
export default function ExpenseSearchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { manager, user } = useAuth();
  return (
    <ExpenseSearchScreen
      key={`${manager.api.environment}:${user?.id}:${manager.getSignInVersion()}:${id}`}
      tripId={id}
    />
  );
}
