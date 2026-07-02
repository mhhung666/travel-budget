import { getCurrentUser } from '@/actions';
import { redirect } from '@/i18n/navigation';
import { sanitizeInternalPath } from '@/lib/redirects';
import HomePage from '@/components/home/HomePage';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const redirectTo = sanitizeInternalPath(redirectParam);

  const result = await getCurrentUser();

  if (result.success && result.data) {
    redirect(redirectTo ?? '/trips');
  }

  return <HomePage redirectTo={redirectTo ?? undefined} />;
}
