import { useLocalSearchParams } from 'expo-router';
import { ActivityBatchScreen } from '@/features/itinerary/ActivityBatchScreen';
export default function BatchDeleteRoute() {
  const { id, dayId, source } = useLocalSearchParams<{
    id: string;
    dayId?: string;
    source?: string;
  }>();
  return <ActivityBatchScreen tripId={id} dayId={dayId} source={source} />;
}
