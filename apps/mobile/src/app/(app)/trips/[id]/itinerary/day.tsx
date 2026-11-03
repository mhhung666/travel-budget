import { useLocalSearchParams } from 'expo-router';
import { DayEditorScreen } from '@/features/itinerary/DayEditorScreen';
export default function DayRoute() {
  const { id, dayId, remove, source } = useLocalSearchParams<{
    id: string;
    dayId?: string;
    remove?: string;
    source?: string;
  }>();
  return <DayEditorScreen tripId={id} dayId={dayId} remove={remove === 'true'} source={source} />;
}
