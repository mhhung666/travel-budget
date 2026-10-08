import { useLocalSearchParams } from 'expo-router';
import { TripMembersScreen } from '@/features/trips/TripMembersScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function MembersRoute() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { manager, user } = useAuth();
  return (
    <TripMembersScreen
      key={`${manager.api.baseUrl}:${user?.id}:${id}:${source}`}
      tripId={id}
      source={source}
    />
  );
}
