import { useLocalSearchParams } from 'expo-router';
import { BudgetScreen } from '@/features/trips/BudgetScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function BudgetRoute() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { manager, user } = useAuth();
  return (
    <BudgetScreen
      key={`${manager.api.environment}:${user?.id}:${id}:${source}`}
      tripId={id}
      source={source}
    />
  );
}
