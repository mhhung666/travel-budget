import { useLocalSearchParams } from 'expo-router';
import { ExpenseDetailScreen } from '@/features/expenses/ExpenseDetailScreen';
export default function ExpenseRoute() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId: string }>();
  return <ExpenseDetailScreen tripId={id} expenseId={expenseId} />;
}
