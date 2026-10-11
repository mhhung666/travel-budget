'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { newPasswordSchema } from '@travel-budget/contracts';
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

  const submitting = useRef(false);
  const [terminal, setTerminal] = useState<'changed' | 'unknown' | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
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

  useEffect(() => {
    if (!waitUntil) return;
    const timer = setTimeout(() => setWaitUntil(0), Math.max(0, waitUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [waitUntil]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || terminal || Date.now() < waitUntil) return;
    setError('');
    setInvalidField(null);
    setSuccess('');

    // 驗證新密碼
    if (!newPasswordSchema.safeParse(newPassword).success) {
      setError(t('password.invalid'));
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

    submitting.current = true;
    setUpdatingPassword(true);

    try {
      const result = await updateProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (!result.success) {
        const map: Record<string, string> = {
          INVALID_CURRENT_PASSWORD: 'password.currentInvalid',
          RESOURCE_CHANGED: 'password.changedElsewhere',
          VALIDATION_ERROR: 'password.invalid',
          RATE_LIMITED: 'password.rateLimited',
        };
        if (result.code === 'RATE_LIMITED')
          setWaitUntil(Date.now() + (result.retryAfter ?? 30) * 1000);
        if (result.error && map[result.error]) {
          setError(t(map[result.error]));
          return;
        }
        if (result.code === 'VALIDATION_ERROR' || result.code === 'NOT_FOUND') {
          setError(t('password.updateError'));
          return;
        }
        setTerminal('unknown');
        setError(t('password.unknown'));
        return;
      }

      setTerminal('changed');
      setSuccess(t('password.reauthenticate'));
      // 清空密碼欄位
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setTerminal('unknown');
      setError(t('password.unknown'));
    } finally {
      submitting.current = false;
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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

      <p className="mb-4 text-sm text-muted-foreground">{t('password.sessionHint')}</p>
      {terminal && (
        <Button className="mb-4" onClick={() => window.location.assign('/login')}>
          {t('password.login')}
        </Button>
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
                disabled={updatingPassword || !!terminal || !!waitUntil}
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
                disabled={updatingPassword || !!terminal || !!waitUntil}
                minLength={6}
              />
              <p id="new-password-help" className="text-xs text-muted-foreground">
                {t('password.invalid')}
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
                disabled={updatingPassword || !!terminal || !!waitUntil}
                minLength={6}
              />
            </div>

            {invalidField === 'confirm' && (
              <p id="confirm-password-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={updatingPassword || !!terminal || !!waitUntil}
                className="w-full sm:w-auto"
              >
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
