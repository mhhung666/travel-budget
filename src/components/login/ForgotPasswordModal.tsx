'use client';

import { useState } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { resetPassword } from '@/actions';

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

export default function ForgotPasswordModal({ open, onClose }: ForgotPasswordModalProps) {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    new_password: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClose = (openState: boolean) => {
    if (!openState) {
      setFormData({ username: '', email: '', new_password: '' });
      setError('');
      setSuccess('');
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const result = await resetPassword(formData);

      if (!result.success) {
        throw new Error(result.error || t('forgotPassword.error'));
      }

      setSuccess(t('forgotPassword.success'));
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('forgotPassword.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('forgotPassword.title')}</DialogTitle>
          <DialogDescription>{t('forgotPassword.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert variant="default" className="border-green-500 text-green-500">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="reset-username">{t('login.username')}</Label>
            <Input
              id="reset-username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-email">{t('register.email')}</Label>
            <Input
              id="reset-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-password">{t('forgotPassword.newPassword')}</Label>
            <Input
              id="reset-password"
              type="password"
              value={formData.new_password}
              onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
              required
              minLength={6}
            />
            <p className="text-[0.8rem] text-muted-foreground">{t('register.passwordHelp')}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()}>
              {tCommon('cancel')}
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
      </DialogContent>
    </Dialog>
  );
}
