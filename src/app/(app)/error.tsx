'use client';

import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/common';

/** (app) 區段的統一錯誤邊界：render 期未捕捉的例外落到這裡。 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');
  return <ErrorState message={error.message || t('error.unknown')} onRetry={reset} />;
}
