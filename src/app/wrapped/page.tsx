'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import { WrappedView } from '@/components/wrapped';
import { useCurrentUser } from '@/hooks/queries';

export default function WrappedPage() {
  const router = useRouter();
  const t = useTranslations('wrapped');

  const { data: user, isSuccess: userResolved } = useCurrentUser();

  // 與地圖頁同樣的客戶端守衛：確定未登入才導向 /login（proxy 也精確保護 /wrapped）。
  useEffect(() => {
    if (userResolved && !user) {
      router.push('/login');
    }
  }, [userResolved, user, router]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        user={
          user
            ? {
                id: user.id,
                username: user.display_name || user.username,
                email: user.email,
                avatar_url: user.avatar_url,
              }
            : null
        }
        showUserMenu={true}
        title={t('title')}
      />
      <WrappedView />
    </div>
  );
}
