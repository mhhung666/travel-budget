import { useLocalSearchParams } from 'expo-router';
import { TripScreen } from '@/features/trips/TripScreen';
export default function TripRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TripScreen id={id} />;
}
