import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
export default function MemberLayout() {
  const auth = useAuth();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
