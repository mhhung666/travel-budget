'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Member } from '@/types';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface RegisterVirtualMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSwitchToLink: () => void;
  virtualMember: Member | null;
  tripId: string;
}

export default function RegisterVirtualMemberDialog({
  open,
  onClose,
  onSwitchToLink,
  virtualMember,
  tripId,
}: RegisterVirtualMemberDialogProps) {
  const t = useTranslations('member.convertVirtual');
  const tErr = useTranslations('member.convertVirtual.errors');
  const tAuth = useTranslations('auth.register');
  const tCommon = useTranslations('common');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    } else {
      setUsername('');
      setDisplayName(virtualMember?.display_name || '');
      setEmail('');
      setPassword('');
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!virtualMember) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`/api/public/trips/${tripId}/convert-member`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          virtualUserId: virtualMember.id,
          username: username.trim(),
          display_name: displayName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Public API returns a structured error code; map it to localized copy.
        const code = data.error as string | undefined;
        setError(code && tErr.has(code) ? tErr(code) : t('error'));
        return;
      }

      // 成功，刷新頁面
      window.location.reload();
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('registerTitle')}</DialogTitle>
          <DialogDescription>
            {t('registerDescription', { name: virtualMember?.display_name || '' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="reg-username">{tAuth('username')}</Label>
            <Input
              id="reg-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-displayName">{tAuth('displayName')}</Label>
            <Input
              id="reg-displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">{tAuth('email')}</Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-[0.8rem] text-muted-foreground">{tAuth('emailHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">{tAuth('password')}</Label>
            <Input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="text-[0.8rem] text-muted-foreground">{tAuth('passwordHelp')}</p>
          </div>

          <div className="text-center text-sm text-muted-foreground mt-2">
            {t('hasAccount')}{' '}
            <button
              type="button"
              onClick={onSwitchToLink}
              className="text-primary hover:underline font-medium focus:outline-none"
            >
              {t('linkExisting')}
            </button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tAuth('registerButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
