import { getCurrentUser } from '@/actions';
import { redirect } from '@/i18n/navigation';
import HomePage from '@/components/home/HomePage';

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: HomeProps) {
  const { locale } = await params;
  const result = await getCurrentUser();

  if (result.success && result.data) {
    redirect({ href: '/trips', locale });
  }

  return <HomePage />;
}
