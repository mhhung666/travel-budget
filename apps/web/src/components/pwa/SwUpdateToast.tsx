'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

/**
 * SW 更新提示（UI/UX 重設計 §6）：新版 service worker 安裝完成後停在
 * waiting（sw.ts 已改 skipWaiting: false），這裡跳常駐 toast「有新版本」，
 * 使用者點「更新」→ 對 waiting SW 送 SKIP_WAITING → controllerchange 後
 * reload 讓新資產生效。dev 環境 SW 停用，本元件自然 no-op。
 */
export function SwUpdateToast() {
  const t = useTranslations('pwa');
  const { toast } = useToast();
  // 每次頁面載入最多提示一次，避免重複打擾。
  const promptedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;

    const promptUpdate = (reg: ServiceWorkerRegistration) => {
      if (cancelled || promptedRef.current || !reg.waiting) return;
      promptedRef.current = true;

      const applyUpdate = () => {
        // 新 SW 接管（controllerchange）後 reload，確保頁面吃到新 precache。
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => window.location.reload(),
          { once: true }
        );
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      };

      toast({
        title: t('updateTitle'),
        description: t('updateDescription'),
        // 常駐直到使用者處理（Radix 預設 5s 會讓更新提示一閃而過）。
        duration: Infinity,
        action: (
          <ToastAction altText={t('updateAction')} onClick={applyUpdate}>
            {t('updateAction')}
          </ToastAction>
        ),
      });
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;

      // 這個分頁載入前就已有版本在等（例如上次沒按更新）。
      promptUpdate(reg);

      // 這個分頁存活期間偵測到新版本下載完成。
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        installing?.addEventListener('statechange', () => {
          // 首次安裝（無 controller）不提示——那不是「更新」。
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            promptUpdate(reg);
          }
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [t, toast]);

  return null;
}
