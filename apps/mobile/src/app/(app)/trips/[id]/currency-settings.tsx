import { useLocalSearchParams } from 'expo-router';
import { TripCurrencyScreen } from '@/features/trips/TripCurrencyScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function CurrencySettingsRoute() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { manager, user } = useAuth();
  return (
    <TripCurrencyScreen
      key={`${manager.api.environment}:${user?.id}:${id}:${source}`}
      tripId={id}
      source={source}
    />
  );
}
