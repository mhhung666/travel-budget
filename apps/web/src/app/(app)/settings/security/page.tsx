'use client';

import { useTranslations } from 'next-intl';
import { SettingsSubpage, SecuritySection } from '@/components/settings';

/** 修改密碼子頁。 */
export default function SecuritySettingsPage() {
  const t = useTranslations('settings');
  return (
    <SettingsSubpage title={t('password.title')}>
      <SecuritySection />
    </SettingsSubpage>
  );
}
