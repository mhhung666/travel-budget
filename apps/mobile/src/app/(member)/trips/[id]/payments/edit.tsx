import { useLocalSearchParams } from 'expo-router';
import { PaymentScreen } from '@/features/settlement/PaymentScreen';
import { useAuth } from '@/features/auth/AuthProvider';
export default function PaymentRoute() {
  const { id, paymentId, source, from, to, amount } = useLocalSearchParams<{
    id: string;
    paymentId?: string;
    source?: string;
    from?: string;
    to?: string;
    amount?: string;
  }>();
  const { manager, user } = useAuth();
  return (
    <PaymentScreen
      key={`${manager.api.baseUrl}:${user?.id}:${id}:${paymentId}:${source}:${from}:${to}:${amount}`}
      tripId={id}
      paymentId={paymentId}
      source={source}
      seed={{ fromId: from, toId: to, amountText: amount }}
    />
  );
}
