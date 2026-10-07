import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
export default function AppLayout() {
  const { status } = useAuth();
  if (status !== 'signedIn' && status !== 'local') return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trips" />
        <Stack.Screen name="record" />
      </Stack.Protected>
      <Stack.Screen name="(local)" />
    </Stack>
  );
}
