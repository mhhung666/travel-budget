'use client';

import { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { requestPasswordReset, resetPassword } from '@/actions';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ForgotPasswordModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'request' | 'reset';

// action 回傳的穩定 error token → forgotPassword i18n key（其餘退回 generic error）。
const ERROR_TOKEN_KEYS: Record<string, string> = {
  INVALID_CODE: 'invalidCode',
  CODE_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
};

export default function ForgotPasswordModal({ open, onClose }: ForgotPasswordModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setStep('request');
    setEmail('');
    setCode('');
    setNewPassword('');
    setError('');
    setSuccess('');
    setLoading(false);
  };

  const handleClose = (openState: boolean) => {
    if (!openState) {
      reset();
      onClose();
    }
  };

  // token / 訊息字串 → 顯示文字（已知 token 對應本地化訊息，否則退回 generic）。
  const messageFor = (token: string) =>
    token in ERROR_TOKEN_KEYS
      ? t(`forgotPassword.${ERROR_TOKEN_KEYS[token]}`)
      : token || t('forgotPassword.error');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await requestPasswordReset({
        email,
        locale: locale as 'en' | 'zh' | 'zh-CN' | 'jp',
      });
      if (!result.success) {
        setError(messageFor(result.error));
        return;
      }
      setSuccess(t('forgotPassword.codeSent'));
      setStep('reset');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await resetPassword({ email, code, new_password: newPassword });
      if (!result.success) {
        setError(messageFor(result.error));
        return;
      }
      setSuccess(t('forgotPassword.success'));
      setTimeout(() => {
        reset();
        onClose();
      }, 2000);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await requestPasswordReset({
        email,
        locale: locale as 'en' | 'zh' | 'zh-CN' | 'jp',
      });
      if (!result.success) {
        setError(messageFor(result.error));
        return;
      }
      setSuccess(t('forgotPassword.codeSent'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('forgotPassword.title')}</DialogTitle>
          <DialogDescription>
            {step === 'request'
              ? t('forgotPassword.step1Description')
              : t('forgotPassword.step2Description', { email })}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequest} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reset-email">{t('forgotPassword.email')}</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onClose()}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  t('forgotPassword.sendCode')
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reset-code">{t('forgotPassword.code')}</Label>
              <Input
                id="reset-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
              />
              <p className="text-[0.8rem] text-muted-foreground">{t('forgotPassword.codeHelp')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-password">{t('forgotPassword.newPassword')}</Label>
              <Input
                id="reset-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-[0.8rem] text-muted-foreground">{t('register.passwordHelp')}</p>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button type="button" variant="ghost" onClick={handleResend} disabled={loading}>
                {t('forgotPassword.resend')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  t('forgotPassword.submit')
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
