import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePendingRecovery } from '@/features/expenses/entryProvider';
export default function MemberLayout() {
  const auth = useAuth();
  usePendingRecovery();
  if (auth.status !== 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
