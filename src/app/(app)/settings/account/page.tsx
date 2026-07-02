'use client';

import { useTranslations } from 'next-intl';
import { SettingsSubpage, ProfileSection } from '@/components/settings';

/** 個人資料子頁（頭像／顯示名稱／變更 Email）。 */
export default function AccountSettingsPage() {
  const t = useTranslations('settings');
  return (
    <SettingsSubpage title={t('profile.title')}>
      <ProfileSection />
    </SettingsSubpage>
  );
}
