import { useLocalSearchParams } from 'expo-router';
import { LocalDraftScreen } from '@/features/localDrafts/LocalDraftsScreen';
export default function DraftRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LocalDraftScreen tripId={id} />;
}
