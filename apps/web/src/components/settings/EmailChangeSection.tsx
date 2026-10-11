'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  requestEmailChange,
  confirmEmailChange,
  cancelEmailChange,
  getCurrentUser,
} from '@/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function EmailChangeSection({
  currentEmail,
  onCurrent,
}: {
  currentEmail: string;
  onCurrent: (email: string) => void;
}) {
  const t = useTranslations('settings'),
    locale = useLocale();
  const [email, setEmail] = useState(''),
    [code, setCode] = useState('');
  const [stage, setStage] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false);
  const [message, setMessage] = useState(''),
    [sendUntil, setSendUntil] = useState(0),
    [verifyUntil, setVerifyUntil] = useState(0),
    [now, setNow] = useState(Date.now);
  const lock = useRef(false),
    active = useRef(false);
  useEffect(() => {
    active.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active.current = false;
      clearInterval(timer);
    };
  }, []);
  async function operate(kind: 'send' | 'confirm' | 'cancel' | 'read') {
    if (
      lock.current ||
      (unknown && kind !== 'read') ||
      (kind === 'send' && Date.now() < sendUntil) ||
      (kind === 'confirm' && Date.now() < verifyUntil)
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage('');
    try {
      if (kind === 'read') {
        const result = await getCurrentUser();
        if (!active.current) return;
        if (!result.success || !result.data) {
          setMessage(t('email.error'));
          return;
        }
        onCurrent(result.data.email);
        setUnknown(false);
        setStage(!!email);
        setMessage(t('email.currentRead'));
        return;
      }
      const result =
        kind === 'send'
          ? await requestEmailChange({ new_email: email, locale })
          : kind === 'confirm'
            ? await confirmEmailChange({ new_email: email, code })
            : await cancelEmailChange();
      if (!active.current) return;
      if (!result.success) {
        const errors: Record<string, string> = {
          INVALID_CODE: 'invalidCode',
          CODE_EXPIRED: 'codeExpired',
          TOO_MANY_ATTEMPTS: 'tooManyAttempts',
          CONFLICT: 'conflict',
          SAME_EMAIL: 'sameEmail',
          RESOURCE_CHANGED: 'stale',
          EMAIL_DELIVERY_FAILED: 'deliveryFailed',
          RATE_LIMITED: 'rateLimited',
        };
        if (result.code === 'RATE_LIMITED') {
          const until = Date.now() + Math.max(1, result.retryAfter ?? 60) * 1000;
          if (kind === 'send') setSendUntil((old) => Math.max(old, until));
          if (kind === 'confirm') setVerifyUntil((old) => Math.max(old, until));
        }
        if (result.code === 'INTERNAL_ERROR' || result.code === 'UNAUTHORIZED') {
          setUnknown(true);
          setMessage(t('email.unknown'));
        } else setMessage(t('email.' + (errors[result.error] ?? 'error')));
        return;
      }
      if (kind === 'send') {
        setEmail(email.trim().toLowerCase());
        setStage(true);
        setSendUntil(Date.now() + 60000);
        setMessage(t('email.codeSent', { email }));
      } else {
        if (kind === 'confirm' && 'email' in result.data && typeof result.data.email === 'string')
          onCurrent(result.data.email);
        setStage(false);
        setEmail('');
        setMessage(t(kind === 'confirm' ? 'email.updateSuccess' : 'email.cancelled'));
      }
    } catch {
      if (active.current) {
        if (kind !== 'read') setUnknown(true);
        setMessage(t(kind === 'read' ? 'email.error' : 'email.unknown'));
      }
    } finally {
      if (active.current) {
        setBusy(false);
        setCode('');
      }
      lock.current = false;
    }
  }
  return (
    <div className="mt-6 border-t border-border pt-6 space-y-3">
      <p>{t('email.current', { email: currentEmail })}</p>
      {message && <p role="status">{message}</p>}
      <Label htmlFor="email">{t('email.title')}</Label>
      <Input
        id="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy || unknown || stage}
      />
      <p className="text-xs text-muted-foreground">{t('email.currentHelp')}</p>
      {stage && (
        <>
          <Label htmlFor="emailCode">{t('email.code')}</Label>
          <Input
            id="emailCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            disabled={busy || unknown}
          />
          <p>{t('email.codeHelp')}</p>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={
            busy ||
            unknown ||
            !email ||
            email.trim().toLowerCase() === currentEmail.toLowerCase() ||
            now < sendUntil
          }
          onClick={() => void operate('send')}
        >
          {t(stage ? 'email.resend' : 'email.sendCode')}
        </Button>
        {stage && (
          <Button
            type="button"
            disabled={busy || unknown || code.length !== 6 || now < verifyUntil}
            onClick={() => void operate('confirm')}
          >
            {t('email.verifyButton')}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy || unknown}
          onClick={() => void operate('cancel')}
        >
          {t('email.cancel')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => void operate('read')}>
          {t('email.readCurrent')}
        </Button>
      </div>
      {(now < sendUntil || now < verifyUntil) && <p>{t('email.rateLimited')}</p>}
    </div>
  );
}
