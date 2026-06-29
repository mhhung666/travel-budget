'use client';

import { useCallback, useEffect, useState } from 'react';
import { savePushSubscription, deletePushSubscription } from '@/actions';

/**
 * Web Push 訂閱 hook（ROADMAP #9 Phase 3）。封裝瀏覽器端的訂閱/取消流程：
 * 權限請求 → 取得共用的 service worker registration（與 #5 離線優先同一個 SW）→
 * `pushManager.subscribe()` → 把訂閱存到後端（savePushSubscription）。
 *
 * 注意：SW 在 dev（Turbopack）停用，故推播僅在 `pnpm build && pnpm start` 下可測。
 * VAPID 公鑰由 `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 在 build 時內嵌；未設定時 `configured`
 * 為 false，UI 應據此隱藏/停用推播開關。
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** VAPID 公鑰（base64url 字串）→ subscribe() 需要的 Uint8Array（綁定 ArrayBuffer）。 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export interface UsePushNotifications {
  /** 瀏覽器是否支援 Service Worker + Push + Notification。 */
  supported: boolean;
  /** 後端是否已配置 VAPID 公鑰（未配置則推播不可用）。 */
  configured: boolean;
  /** 目前通知權限（'default' | 'granted' | 'denied'）。 */
  permission: NotificationPermission;
  /** 此裝置目前是否已訂閱推播。 */
  subscribed: boolean;
  /** 訂閱/取消進行中。 */
  busy: boolean;
  /** 訂閱推播（請求權限 + 註冊 + 存後端）。回傳是否成功。 */
  subscribe: () => Promise<boolean>;
  /** 取消推播（解除註冊 + 從後端刪除）。 */
  unsubscribe: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotifications {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);

  const configured = !!VAPID_PUBLIC_KEY;

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    /* eslint-disable react-hooks/set-state-in-effect --
       掛載時偵測瀏覽器能力（window/Notification 僅 client 可得），為刻意的初始化副作用；
       必須在 mount 後執行以避免 SSR 水合不一致（比照 settings 頁掛載抓取使用者資料）。 */
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    /* eslint-enable react-hooks/set-state-in-effect */

    // 讀取此裝置目前的訂閱狀態（SW ready 後）。此為非同步 callback，不在 effect body 同步呼叫。
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {
        // SW 尚未就緒（如 dev 停用）— 視為未訂閱。
      });
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || !configured) return false;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        });
      }

      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
      const result = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (!result.success) return false;

      setSubscribed(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, configured]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = sub;
        await sub.unsubscribe();
        await deletePushSubscription(endpoint);
      }
      setSubscribed(false);
    } catch {
      // best-effort：失敗就維持原狀
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, configured, permission, subscribed, busy, subscribe, unsubscribe };
}
