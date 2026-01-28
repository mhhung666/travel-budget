import { redirect } from '@/i18n/navigation';

interface LoginPageProps {
  params: Promise<{ locale: string }>;
}

export default async function LoginPage({ params }: LoginPageProps) {
  const { locale } = await params;
  redirect({ href: '/', locale });
}
