import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
export default function LocalLayout() {
  const { status } = useAuth();
  if (status !== 'signedIn' && status !== 'local') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
