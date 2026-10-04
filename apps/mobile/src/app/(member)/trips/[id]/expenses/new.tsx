import { useLocalSearchParams } from 'expo-router';
import { NewExpenseScreen } from '@/features/expenses/NewExpenseScreen';
export default function NewExpenseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NewExpenseScreen tripId={id} />;
}
