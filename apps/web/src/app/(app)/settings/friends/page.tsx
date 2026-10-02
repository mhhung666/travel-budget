'use client';

import { useTranslations } from 'next-intl';
import { SettingsSubpage } from '@/components/settings';
import { FriendsSection } from '@/components/friends';

/** 好友管理子頁（好友列表 + pending 收件匣，ROADMAP #12 Phase 1）。 */
export default function FriendsSettingsPage() {
  const t = useTranslations('friends');
  return (
    <SettingsSubpage title={t('title')}>
      <FriendsSection />
    </SettingsSubpage>
  );
}
