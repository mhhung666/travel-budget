import { getCurrentUser } from '@/actions';
import { redirect } from '@/i18n/navigation';
import HomePage from '@/components/home/HomePage';

export default async function Home() {
  const result = await getCurrentUser();

  if (result.success && result.data) {
    redirect('/trips');
  }

  return <HomePage />;
}
