'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCurrentUser, updateProfile } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/hooks/queries';
import { logger } from '@/lib/logger';

import { EmailChangeSection } from './EmailChangeSection';
import AvatarUploader from '@/components/AvatarUploader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccountSettingsSkeleton } from '@/components/skeletons';

/**
 * 個人資料（/settings/account）：頭像、顯示名稱、變更 Email（兩步驟驗證碼）。
 * 自 588 行的 settings 單頁拆出（UI/UX 重設計 5.5）。
 */
export function ProfileSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  // 「我的」選單頁的頭像／名稱吃 useCurrentUser 快取，改完個資讓它失效。
  const invalidateCurrentUser = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.currentUser });

  const [user, setUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
        setDisplayName(result.data.display_name);
      }
    } catch (error) {
      logger.error('獲取用戶資料失敗', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載時抓取使用者資料，為刻意的初始化副作用
    fetchUser();
  }, [fetchUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setUpdatingProfile(true);

    try {
      const result = await updateProfile({ display_name: displayName });

      if (!result.success) {
        throw new Error(result.error || t('errors.updateFailed'));
      }

      setSuccess(t('profile.updateSuccess'));
      if (user) {
        setUser({ ...user, display_name: displayName });
      }
      invalidateCurrentUser();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingProfile(false);
    }
  };

  if (loading) {
    return <AccountSettingsSkeleton />;
  }

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success" className="mb-6">
          <AlertTitle>{tCommon('successTitle')}</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-6">
            <AvatarUploader
              displayName={user?.display_name || user?.username || ''}
              avatarUrl={user?.avatar_url ?? null}
              onChange={(url) => {
                setUser((u) => (u ? { ...u, avatar_url: url } : u));
                invalidateCurrentUser();
              }}
            />
          </div>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('profile.username')}</Label>
              <Input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={user?.username || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">{t('profile.usernameHelp')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input
                id="displayName"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={updatingProfile || displayName === user?.display_name}
                className="w-full sm:w-auto"
              >
                {updatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('profile.saveChanges')}
              </Button>
            </div>
          </form>

          {user && (
            <EmailChangeSection
              key={user.id}
              currentEmail={user.email || ''}
              onCurrent={(email) => {
                setUser((u) => (u ? { ...u, email } : u));
                void invalidateCurrentUser();
              }}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
