import { useLocalSearchParams } from 'expo-router';
import { ActivityEditorScreen } from '@/features/itinerary/ActivityEditorScreen';
export default function ActivityRoute() {
  const { id, dayId, activityId, remove, source } = useLocalSearchParams<{
    id: string;
    dayId: string;
    activityId?: string;
    remove?: string;
    source?: string;
  }>();
  return (
    <ActivityEditorScreen
      tripId={id}
      dayId={dayId}
      activityId={activityId}
      remove={remove === 'true'}
      source={source}
    />
  );
}
