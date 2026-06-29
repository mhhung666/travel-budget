'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/actions';
import type { NotificationItem } from '@/types';
import { notificationKeys } from './keys';

/**
 * Unread notification count for the navbar bell badge.
 *
 * Polls every 60s and on window focus (overriding the global
 * `refetchOnWindowFocus: false`) so the badge stays roughly live. Web Push now
 * invalidates this query on arrival for instant updates (see
 * {@link useNotificationPushSync}); polling remains the fallback for users
 * without push. Never throws: a failed/logged-out fetch yields 0 (bell hides).
 */
export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async (): Promise<number> => {
      const res = await getUnreadNotificationCount();
      return res.success ? res.data.count : 0;
    },
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/**
 * Bridges Web Push → the in-app bell (ROADMAP #9 Phase 3). After each push the
 * service worker posts a `notification-received` message (see src/sw.ts); on
 * receipt we invalidate the notification queries so the unread badge + list
 * refresh instantly instead of waiting for the 60s poll. Polling stays as the
 * fallback for users without push. No-op where SW messaging is unavailable.
 */
export function useNotificationPushSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'notification-received') {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [queryClient]);
}

/**
 * The notification list (newest first). Pass `enabled` to defer the fetch until
 * the bell panel is opened.
 */
export function useNotificationList(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: async (): Promise<NotificationItem[]> => {
      const res = await getNotifications();
      return res.success ? res.data : [];
    },
    enabled,
  });
}

/**
 * Mark-read mutations. Both invalidate the list + unread-count so the badge and
 * panel refresh together.
 */
export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  return { markRead, markAllRead };
}
