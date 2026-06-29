'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, User, Lock, Bell, Loader2, X } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import {
  getCurrentUser,
  updateProfile,
  updateNotificationPrefs,
  getPushSubscriptions,
  deletePushSubscription,
} from '@/actions';
import type { AuthUserWithCreatedAt, PushDeviceItem } from '@/actions';
import { describeUserAgent } from '@/lib/pushDevice';
import { formatRelativeTime } from '@/lib/relativeTime';

import Navbar from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountSettingsSkeleton } from '@/components/skeletons';
import AvatarUploader from '@/components/AvatarUploader';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { logger } from '@/lib/logger';

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const locale = useLocale();
  const [user, setUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 表單狀態
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);

  // Web Push 訂閱（瀏覽器推播；opt-in 即「有沒有訂閱」，不存 User 層開關）
  const push = usePushNotifications();
  const [pushDevices, setPushDevices] = useState<PushDeviceItem[]>([]);

  // 提交狀態
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
        setDisplayName(result.data.display_name);
        setEmail(result.data.email || '');
        setNotifyByEmail(result.data.notify_by_email);
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
      const profileData: Record<string, string> = { display_name: displayName };
      if (email !== (user?.email || '')) {
        profileData.new_email = email;
      }

      const result = await updateProfile(profileData);

      if (!result.success) {
        throw new Error(result.error || t('errors.updateFailed'));
      }

      const nameChanged = displayName !== user?.display_name;
      const emailChanged = email !== (user?.email || '');
      if (nameChanged && emailChanged) {
        setSuccess(`${t('profile.updateSuccess')}、${t('email.updateSuccess')}`);
      } else if (emailChanged) {
        setSuccess(t('email.updateSuccess'));
      } else {
        setSuccess(t('profile.updateSuccess'));
      }
      if (user) {
        setUser({ ...user, display_name: displayName, email });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 驗證新密碼
    if (newPassword.length < 6) {
      setError(t('password.tooShort'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    setUpdatingPassword(true);

    try {
      const result = await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (!result.success) {
        throw new Error(result.error || t('password.updateError'));
      }

      setSuccess(t('password.updateSuccess'));
      // 清空密碼欄位
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSaveNotifications = async (next: boolean) => {
    setError('');
    setSuccess('');
    setUpdatingNotifications(true);
    // 樂觀更新；失敗時回復
    const prev = notifyByEmail;
    setNotifyByEmail(next);
    try {
      // 存檔時帶入當前 UI 語系，供伺服端 Email 寄送決定語系
      const result = await updateNotificationPrefs({ notify_by_email: next, locale });
      if (!result.success) {
        throw new Error(result.error || t('errors.updateFailed'));
      }
      setSuccess(t('notifications.updateSuccess'));
    } catch (err: unknown) {
      setNotifyByEmail(prev);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const fetchPushDevices = useCallback(async () => {
    if (!push.supported || !push.configured) return;
    const result = await getPushSubscriptions();
    if (result.success) setPushDevices(result.data);
  }, [push.supported, push.configured]);

  // 在能力就緒後、以及訂閱狀態變動（訂閱/取消）後，重抓已訂閱裝置列表。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 抓取裝置清單，set 發生在 async callback 內、非同步呼叫
    fetchPushDevices();
  }, [fetchPushDevices, push.subscribed]);

  const handleTogglePush = async (next: boolean) => {
    setError('');
    setSuccess('');
    if (next) {
      const ok = await push.subscribe();
      if (ok) setSuccess(t('notifications.pushEnabled'));
      else if (push.permission === 'denied') setError(t('notifications.pushBlocked'));
      else setError(t('notifications.pushFailed'));
    } else {
      await push.unsubscribe();
      setSuccess(t('notifications.pushDisabled'));
    }
  };

  const handleRemoveDevice = async (device: PushDeviceItem) => {
    setError('');
    setSuccess('');
    // 目前裝置：連同瀏覽器端的 pushManager 一起解除；其他裝置：只從後端刪除參照。
    if (device.endpoint === push.currentEndpoint) {
      await push.unsubscribe();
    } else {
      await deletePushSubscription(device.endpoint);
    }
    await fetchPushDevices();
  };

  if (loading) {
    return <AccountSettingsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} title={t('title')} />

      <div className="pt-24 pb-8 container mx-auto px-4 max-w-2xl">
        {/* 返回按鈕 */}
        <Button
          variant="ghost"
          onClick={() => router.push('/trips')}
          className="mb-6 text-muted-foreground hover:text-foreground pl-0 hover:bg-transparent"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToTrips')}
        </Button>

        {/* 標題 */}
        <h1 className="text-3xl font-bold mb-8 text-foreground">{t('title')}</h1>

        {/* 訊息提示 */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="mb-6 border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-300">
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* 個人資料設定 */}
        <Card className="mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="h-5 w-5 text-primary" />
              {t('profile.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <AvatarUploader
                displayName={user?.display_name || user?.username || ''}
                avatarUrl={user?.avatar_url ?? null}
                onChange={(url) => setUser((u) => (u ? { ...u, avatar_url: url } : u))}
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

              <div className="space-y-2">
                <Label htmlFor="email">{t('email.title')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={
                    updatingProfile ||
                    (displayName === user?.display_name && email === (user?.email || ''))
                  }
                  className="w-full sm:w-auto"
                >
                  {updatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('profile.saveChanges')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 通知偏好 */}
        <Card className="mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Bell className="h-5 w-5 text-primary" />
              {t('notifications.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={notifyByEmail}
                disabled={updatingNotifications}
                onCheckedChange={(checked) => handleSaveNotifications(checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">
                  {t('notifications.emailLabel')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('notifications.emailHelp')}
                </span>
              </span>
            </label>

            {/* Web Push（瀏覽器推播）。不支援/未配置時停用並提示。 */}
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={push.subscribed}
                disabled={
                  !push.supported || !push.configured || push.busy || push.permission === 'denied'
                }
                onCheckedChange={(checked) => handleTogglePush(checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">
                  {t('notifications.pushLabel')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {push.needsInstall
                    ? t('notifications.pushInstallHint')
                    : !push.supported || !push.configured
                      ? t('notifications.pushUnsupported')
                      : push.permission === 'denied'
                        ? t('notifications.pushBlocked')
                        : t('notifications.pushHelp')}
                </span>
              </span>
            </label>

            {/* 已訂閱裝置列表（可逐一撤銷，標記目前裝置）。 */}
            {push.supported && push.configured && pushDevices.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('notifications.pushDevices')}
                </p>
                <ul className="space-y-2">
                  {pushDevices.map((device) => {
                    const isCurrent = device.endpoint === push.currentEndpoint;
                    return (
                      <li
                        key={device.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm text-foreground">
                            <span className="truncate">
                              {describeUserAgent(device.user_agent) ||
                                t('notifications.unknownDevice')}
                            </span>
                            {isCurrent && (
                              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {t('notifications.pushThisDevice')}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatRelativeTime(device.created_at, locale)}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          disabled={push.busy}
                          onClick={() => handleRemoveDevice(device)}
                          aria-label={t('notifications.pushRemoveDevice')}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 密碼設定 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Lock className="h-5 w-5 text-primary" />
              {t('password.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t('password.current')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">{t('password.new')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">{t('password.minLength')}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('password.confirm')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={updatingPassword} className="w-full sm:w-auto">
                  {updatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('password.updateButton')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
