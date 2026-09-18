'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Share, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_UNTIL = 'travel-budget:pwa-install-dismissed-until';
const REMIND_AFTER = 7 * 24 * 60 * 60 * 1000;

export function InstallPrompt() {
  const t = useTranslations('pwa.install');
  const titleId = useId();
  const stepsId = useId();
  const deferredPrompt = useRef<InstallEvent | null>(null);
  const suppressed = useRef(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const isStandalone = () =>
      standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(navigator.userAgent);
    try {
      suppressed.current = Number(localStorage.getItem(DISMISSED_UNTIL)) > Date.now();
    } catch {
      // Storage may be disabled; dismissal still works for this visit.
    }

    const hide = () => {
      suppressed.current = true;
      deferredPrompt.current = null;
      setPlatform(null);
    };
    const onDisplayChange = () => {
      if (isStandalone()) hide();
    };
    const onInstallPrompt = (event: Event) => {
      if (!android || isStandalone() || suppressed.current) return;
      event.preventDefault();
      deferredPrompt.current = event as InstallEvent;
      setFailed(false);
      setPlatform('android');
    };
    // Let the page settle before showing the iOS instructions invitation.
    const timer = window.setTimeout(() => {
      if (ios && !isStandalone() && !suppressed.current) setPlatform('ios');
    }, 1500);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', hide);
    standalone.addEventListener('change', onDisplayChange);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', hide);
      standalone.removeEventListener('change', onDisplayChange);
    };
  }, []);

  const dismiss = () => {
    suppressed.current = true;
    deferredPrompt.current = null;
    setPlatform(null);
    try {
      localStorage.setItem(DISMISSED_UNTIL, String(Date.now() + REMIND_AFTER));
    } catch {
      // Keep the page usable when browser storage is unavailable.
    }
  };

  const install = async () => {
    if (platform === 'ios') {
      setShowSteps(true);
      return;
    }
    const event = deferredPrompt.current;
    if (!event || installing) return;
    deferredPrompt.current = null; // Each browser event can only be used once.
    setInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'dismissed') dismiss();
      else {
        suppressed.current = true;
        setPlatform(null);
      }
    } catch {
      setFailed(true);
    } finally {
      setInstalling(false);
    }
  };

  if (!platform) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left"
    >
      <div className="flex items-start gap-3">
        <Smartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-sm font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!failed && (
              <Button
                type="button"
                size="sm"
                onClick={install}
                disabled={installing}
                aria-expanded={platform === 'ios' ? showSteps : undefined}
                aria-controls={platform === 'ios' ? stepsId : undefined}
              >
                <Download aria-hidden="true" />
                {t('action')}
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={dismiss} disabled={installing}>
              {t('later')}
            </Button>
          </div>
          {showSteps && (
            <div id={stepsId} className="mt-3 border-t border-border pt-3 text-sm">
              <p className="text-muted-foreground">{t('iosBrowser')}</p>
              <ol className="mt-2 list-decimal space-y-2 pl-5">
                <li>
                  {t('iosShare')}{' '}
                  <Share aria-hidden="true" className="inline h-4 w-4 align-text-bottom" />
                </li>
                <li>{t('iosHome')}</li>
                <li>{t('iosConfirm')}</li>
              </ol>
            </div>
          )}
          {failed && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              {t('fallback')}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
