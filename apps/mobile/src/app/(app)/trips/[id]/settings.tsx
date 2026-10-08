import { useLocalSearchParams } from 'expo-router';
import { TripSettingsScreen } from '@/features/trips/TripSettingsScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function SettingsRoute() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { manager, user } = useAuth();
  return (
    <TripSettingsScreen
      key={`${manager.api.environment}:${user?.id}:${id}:${source}`}
      tripId={id}
      source={source}
    />
  );
}
