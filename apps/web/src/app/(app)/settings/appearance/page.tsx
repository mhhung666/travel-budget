'use client';

import { useTranslations } from 'next-intl';
import { SettingsSubpage, AppearanceSection } from '@/components/settings';

/** 外觀子頁（主題／語言）。 */
export default function AppearanceSettingsPage() {
  const t = useTranslations('settings');
  return (
    <SettingsSubpage title={t('appearance.title')}>
      <AppearanceSection />
    </SettingsSubpage>
  );
}
