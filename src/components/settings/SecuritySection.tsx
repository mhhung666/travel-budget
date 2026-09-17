'use client';

import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { updateProfile } from '@/actions';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** 修改密碼（/settings/security）。自 settings 單頁拆出（UI/UX 重設計 5.5）。 */
export function SecuritySection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const [invalidField, setInvalidField] = useState<'new' | 'confirm' | null>(null);
  const clearFieldError = () => {
    setInvalidField(null);
    setError('');
  };
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInvalidField(null);
    setSuccess('');

    // 驗證新密碼
    if (newPassword.length < 6) {
      setError(t('password.tooShort'));
      setInvalidField('new');
      newPasswordRef.current?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'));
      setInvalidField('confirm');
      confirmPasswordRef.current?.focus();
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
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('password.current')}</Label>
              <Input
                id="currentPassword"
                autoComplete="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('password.new')}</Label>
              <Input
                ref={newPasswordRef}
                aria-invalid={invalidField === 'new'}
                aria-describedby={
                  invalidField === 'new' ? 'new-password-error' : 'new-password-help'
                }
                id="newPassword"
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  clearFieldError();
                }}
                required
                minLength={6}
              />
              <p id="new-password-help" className="text-xs text-muted-foreground">
                {t('password.minLength')}
              </p>
              {invalidField === 'new' && (
                <p id="new-password-error" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('password.confirm')}</Label>
              <Input
                ref={confirmPasswordRef}
                aria-invalid={invalidField === 'confirm'}
                aria-describedby={invalidField === 'confirm' ? 'confirm-password-error' : undefined}
                id="confirmPassword"
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearFieldError();
                }}
                required
                minLength={6}
              />
            </div>

            {invalidField === 'confirm' && (
              <p id="confirm-password-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="pt-2">
              <Button type="submit" disabled={updatingPassword} className="w-full sm:w-auto">
                {updatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('password.updateButton')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
