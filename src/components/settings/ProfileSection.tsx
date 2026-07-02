'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { getCurrentUser, updateProfile, requestEmailChange, confirmEmailChange } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import { useQueryClient } from '@tanstack/react-query';
import { tripKeys } from '@/hooks/queries';
import { logger } from '@/lib/logger';

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
  const locale = useLocale();
  const queryClient = useQueryClient();

  // 「我的」選單頁的頭像／名稱吃 useCurrentUser 快取，改完個資讓它失效。
  const invalidateCurrentUser = () =>
    queryClient.invalidateQueries({ queryKey: tripKeys.currentUser });

  const [user, setUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  // 變更 Email：兩步驟（寄碼到新信箱 → 輸入驗證碼確認）
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
        setDisplayName(result.data.display_name);
        setEmail(result.data.email || '');
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

  // 後端穩定錯誤 token → 本地化訊息（與 ForgotPasswordModal 一致的對應方式）。
  const emailErrorMessage = (token: string | undefined): string => {
    const map: Record<string, string> = {
      INVALID_CODE: 'email.invalidCode',
      CODE_EXPIRED: 'email.codeExpired',
      TOO_MANY_ATTEMPTS: 'email.tooManyAttempts',
      CONFLICT: 'email.conflict',
      SAME_EMAIL: 'email.sameEmail',
    };
    return token && map[token] ? t(map[token]) : t('email.error');
  };

  // 步驟一：寄驗證碼到新信箱。
  const handleSendEmailCode = async () => {
    setError('');
    setSuccess('');
    setSendingEmailCode(true);
    try {
      const result = await requestEmailChange({ new_email: email, locale });
      if (!result.success) {
        setError(emailErrorMessage(result.error));
        return;
      }
      setEmailCodeSent(true);
      setEmailCode('');
      setSuccess(t('email.codeSent', { email }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingEmailCode(false);
    }
  };

  // 步驟二：以驗證碼確認變更。
  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setVerifyingEmail(true);
    try {
      const result = await confirmEmailChange({ code: emailCode });
      if (!result.success) {
        setError(emailErrorMessage(result.error));
        return;
      }
      setSuccess(t('email.updateSuccess'));
      setEmailCodeSent(false);
      setEmailCode('');
      if (user) {
        setUser({ ...user, email });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyingEmail(false);
    }
  };

  // 取消變更：還原為目前信箱、收起驗證碼步驟。
  const handleCancelEmailChange = () => {
    setError('');
    setSuccess('');
    setEmail(user?.email || '');
    setEmailCodeSent(false);
    setEmailCode('');
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
              <Input id="username" value={user?.username || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">{t('profile.usernameHelp')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t('profile.displayName')}</Label>
              <Input
                id="displayName"
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

          {/* 變更 Email：寄碼到新信箱 → 輸入驗證碼確認（兩步驟） */}
          <div className="mt-6 border-t border-border pt-6">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email.title')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={emailCodeSent}
              />
              <p className="text-xs text-muted-foreground">{t('email.currentHelp')}</p>
            </div>

            {!emailCodeSent ? (
              <div className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendEmailCode}
                  disabled={sendingEmailCode || !email || email === (user?.email || '')}
                  className="w-full sm:w-auto"
                >
                  {sendingEmailCode && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {sendingEmailCode ? t('email.sending') : t('email.sendCode')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleConfirmEmailChange} className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  {t('email.step2Description', { email })}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="emailCode">{t('email.code')}</Label>
                  <Input
                    id="emailCode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{t('email.codeHelp')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={verifyingEmail || emailCode.length !== 6}
                    className="w-full sm:w-auto"
                  >
                    {verifyingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {verifyingEmail ? t('email.verifying') : t('email.verifyButton')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleSendEmailCode}
                    disabled={sendingEmailCode}
                  >
                    {t('email.resend')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleCancelEmailChange}>
                    {t('email.cancel')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
