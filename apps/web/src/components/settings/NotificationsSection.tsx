'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  getPushSubscriptions,
  deletePushSubscription,
} from '@/actions';
import type { PushDeviceItem } from '@/actions';
import type { NotificationPreferences } from '@travel-budget/contracts';
import { describeUserAgent } from '@/lib/pushDevice';
import { formatRelativeTime } from '@/lib/relativeTime';
import { usePushNotifications } from '@/hooks/usePushNotifications';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);

  // Web Push 訂閱（瀏覽器推播；opt-in 即「有沒有訂閱」，不存 User 層開關）
  const push = usePushNotifications();
  const [pushDevices, setPushDevices] = useState<PushDeviceItem[]>([]);

  const readPreferences = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    const current = generation.current;
    setUpdatingNotifications(true);
    setError('');
    setSuccess('');
    try {
      const result = await getNotificationPrefs();
      if (current !== generation.current) return;
      if (!result.success) {
        setError(t('errors.updateFailed'));
        return;
      }
      setPreferences(result.data);
      setUncertain(false);
      setSuccess(t('notifications.current'));
    } catch {
      if (current === generation.current) setError(t('errors.updateFailed'));
    } finally {
      if (current === generation.current) {
        operation.current = false;
        setUpdatingNotifications(false);
      }
    }
  }, [t]);
  useEffect(() => {
    const current = generation.current;
    queueMicrotask(() => {
      if (generation.current === current) void readPreferences();
    });
    return () => {
      generation.current = current + 1;
      operation.current = false;
    };
  }, [readPreferences]);

  const handleSaveNotifications = async (input: { notify_by_email?: boolean; locale?: string }) => {
    if (operation.current || uncertain || !preferences) return;
    operation.current = true;
    const current = generation.current;
    setError('');
    setSuccess('');
    setUpdatingNotifications(true);
    try {
      const result = await updateNotificationPrefs(input);
      if (current !== generation.current) return;
      if (!result.success) {
        const definite = [
          'VALIDATION_ERROR',
          'NOT_FOUND',
          'UNAUTHORIZED',
          'FORBIDDEN',
          'RATE_LIMITED',
        ].includes(result.code ?? '');
        setUncertain(!definite);
        setError(t(definite ? 'errors.updateFailed' : 'notifications.unknown'));
        return;
      }
      setPreferences({ notifyByEmail: result.data.notifyByEmail, locale: result.data.locale });
      setSuccess(t('notifications.updateSuccess'));
    } catch {
      if (current === generation.current) {
        setUncertain(true);
        setError(t('notifications.unknown'));
      }
    } finally {
      if (current === generation.current) {
        operation.current = false;
        setUpdatingNotifications(false);
      }
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
              checked={preferences?.notifyByEmail ?? false}
              disabled={updatingNotifications || !preferences || uncertain}
              onCheckedChange={(checked) =>
                handleSaveNotifications({ notify_by_email: checked === true })
              }
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

          <div className="space-y-2">
            <label htmlFor="notification-language" className="text-sm font-medium text-foreground">
              {t('notifications.languageLabel')}
            </label>
            <p className="text-xs text-muted-foreground">{t('notifications.languageHelp')}</p>
            <Select
              value={preferences?.locale ?? ''}
              disabled={updatingNotifications || !preferences || uncertain}
              onValueChange={(value) => void handleSaveNotifications({ locale: value })}
            >
              <SelectTrigger id="notification-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">繁體中文</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="jp">日本語</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={updatingNotifications}
              onClick={() => void readPreferences()}
            >
              {t(uncertain ? 'notifications.checkCurrent' : 'notifications.refresh')}
            </Button>
          </div>

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
