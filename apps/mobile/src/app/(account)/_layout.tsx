import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
export default function AccountLayout() {
  const auth = useAuth();
  if (auth.status !== 'signedOut') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
