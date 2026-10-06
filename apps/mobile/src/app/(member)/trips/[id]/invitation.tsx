import { useLocalSearchParams } from 'expo-router';
import { InvitationScreen } from '@/features/tripEntry/InvitationScreen';
export default function Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <InvitationScreen id={id} />;
}
