'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ArrowLeft, User, Lock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCurrentUser, updateProfile } from '@/actions';

import Navbar from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 表單狀態
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 提交狀態
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
        setDisplayName(result.data.display_name);
        setEmail(result.data.email || '');
      }
    } catch (error) {
      console.error('獲取用戶資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

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
      setUser({ ...user, display_name: displayName, email });
    } catch (err: any) {
      setError(err.message);
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <Loader2 className="animate-spin h-10 w-10 text-primary" />
      </div>
    );
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
        <h1 className="text-3xl font-bold mb-8 text-foreground">
          {t('title')}
        </h1>

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
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('profile.username')}</Label>
                <Input
                  id="username"
                  value={user?.username || ''}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {t('profile.usernameHelp')}
                </p>
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
                  disabled={updatingProfile || (displayName === user?.display_name && email === (user?.email || ''))}
                  className="w-full sm:w-auto"
                >
                  {updatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('profile.saveChanges')}
                </Button>
              </div>
            </form>
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
                <p className="text-xs text-muted-foreground">
                  {t('password.minLength')}
                </p>
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
