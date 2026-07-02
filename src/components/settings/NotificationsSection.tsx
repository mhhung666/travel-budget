'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  getCurrentUser,
  updateNotificationPrefs,
  getPushSubscriptions,
  deletePushSubscription,
} from '@/actions';
import type { PushDeviceItem } from '@/actions';
import { describeUserAgent } from '@/lib/pushDevice';
import { formatRelativeTime } from '@/lib/relativeTime';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { logger } from '@/lib/logger';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * 通知偏好（/settings/notifications）：Email 通知開關 + Web Push 訂閱與裝置管理。
 * 自 settings 單頁拆出（UI/UX 重設計 5.5）。
 */
export function NotificationsSection() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  // Web Push 訂閱（瀏覽器推播；opt-in 即「有沒有訂閱」，不存 User 層開關）
  const push = usePushNotifications();
  const [pushDevices, setPushDevices] = useState<PushDeviceItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const result = await getCurrentUser();
        if (result.success && result.data) setNotifyByEmail(result.data.notify_by_email);
      } catch (error) {
        logger.error('獲取用戶資料失敗', error);
      }
    })();
  }, []);

  const handleSaveNotifications = async (next: boolean) => {
    setError('');
    setSuccess('');
    setUpdatingNotifications(true);
    // 樂觀更新；失敗時回復
    const prev = notifyByEmail;
    setNotifyByEmail(next);
    try {
      // 存檔時帶入當前 UI 語系，供伺服端 Email 寄送決定語系
      const result = await updateNotificationPrefs({ notify_by_email: next, locale });
      if (!result.success) {
        throw new Error(result.error || t('errors.updateFailed'));
      }
      setSuccess(t('notifications.updateSuccess'));
    } catch (err: unknown) {
      setNotifyByEmail(prev);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingNotifications(false);
    }
  };

  const fetchPushDevices = useCallback(async () => {
    if (!push.supported || !push.configured) return;
    const result = await getPushSubscriptions();
    if (result.success) setPushDevices(result.data);
  }, [push.supported, push.configured]);

  // 在能力就緒後、以及訂閱狀態變動（訂閱/取消）後，重抓已訂閱裝置列表。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 抓取裝置清單，set 發生在 async callback 內、非同步呼叫
    fetchPushDevices();
  }, [fetchPushDevices, push.subscribed]);

  const handleTogglePush = async (next: boolean) => {
    setError('');
    setSuccess('');
    if (next) {
      const ok = await push.subscribe();
      if (ok) setSuccess(t('notifications.pushEnabled'));
      else if (push.permission === 'denied') setError(t('notifications.pushBlocked'));
      else setError(t('notifications.pushFailed'));
    } else {
      await push.unsubscribe();
      setSuccess(t('notifications.pushDisabled'));
    }
  };

  const handleRemoveDevice = async (device: PushDeviceItem) => {
    setError('');
    setSuccess('');
    // 目前裝置：連同瀏覽器端的 pushManager 一起解除；其他裝置：只從後端刪除參照。
    if (device.endpoint === push.currentEndpoint) {
      await push.unsubscribe();
    } else {
      await deletePushSubscription(device.endpoint);
    }
    await fetchPushDevices();
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
        <CardContent className="space-y-4 pt-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={notifyByEmail}
              disabled={updatingNotifications}
              onCheckedChange={(checked) => handleSaveNotifications(checked === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t('notifications.emailLabel')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t('notifications.emailHelp')}
              </span>
            </span>
          </label>

          {/* Web Push（瀏覽器推播）。不支援/未配置時停用並提示。 */}
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={push.subscribed}
              disabled={
                !push.supported || !push.configured || push.busy || push.permission === 'denied'
              }
              onCheckedChange={(checked) => handleTogglePush(checked === true)}
              className="mt-0.5"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium text-foreground">
                {t('notifications.pushLabel')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {push.needsInstall
                  ? t('notifications.pushInstallHint')
                  : !push.supported || !push.configured
                    ? t('notifications.pushUnsupported')
                    : push.permission === 'denied'
                      ? t('notifications.pushBlocked')
                      : t('notifications.pushHelp')}
              </span>
            </span>
          </label>

          {/* 已訂閱裝置列表（可逐一撤銷，標記目前裝置）。 */}
          {push.supported && push.configured && pushDevices.length > 0 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                {t('notifications.pushDevices')}
              </p>
              <ul className="space-y-2">
                {pushDevices.map((device) => {
                  const isCurrent = device.endpoint === push.currentEndpoint;
                  return (
                    <li
                      key={device.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm text-foreground">
                          <span className="truncate">
                            {describeUserAgent(device.user_agent) ||
                              t('notifications.unknownDevice')}
                          </span>
                          {isCurrent && (
                            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                              {t('notifications.pushThisDevice')}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatRelativeTime(device.created_at, locale)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={push.busy}
                        onClick={() => handleRemoveDevice(device)}
                        aria-label={t('notifications.pushRemoveDevice')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
