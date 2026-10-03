import { useLocalSearchParams } from 'expo-router';
import { ExpensesScreen } from '@/features/expenses/ExpensesScreen';
export default function ExpensesRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpensesScreen tripId={id} />;
}
