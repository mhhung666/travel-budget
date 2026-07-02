'use client';

import { useTranslations } from 'next-intl';
import { SettingsSubpage, NotificationsSection } from '@/components/settings';

/** 通知設定子頁（Email 通知＋Web Push 訂閱與裝置管理）。 */
export default function NotificationsSettingsPage() {
  const t = useTranslations('settings');
  return (
    <SettingsSubpage title={t('notifications.title')}>
      <NotificationsSection />
    </SettingsSubpage>
  );
}
