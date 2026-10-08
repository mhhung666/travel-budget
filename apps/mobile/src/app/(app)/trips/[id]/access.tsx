import { useLocalSearchParams } from 'expo-router';
import { TripAccessScreen } from '@/features/trips/TripAccessScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function AccessRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { manager, user } = useAuth();
  return <TripAccessScreen key={`${manager.api.environment}:${user?.id}:${id}`} tripId={id} />;
}
