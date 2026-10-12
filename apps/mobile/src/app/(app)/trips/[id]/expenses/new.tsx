import { useLocalSearchParams } from 'expo-router';
import { NewExpenseScreen } from '@/features/expenses/NewExpenseScreen';
export default function NewExpenseRoute() {
  const { id, selection } = useLocalSearchParams<{ id: string; selection?: string }>();
  return <NewExpenseScreen tripId={id} selection={selection} />;
}
