'use client';

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
 * `refetchOnWindowFocus: false`) so the badge stays roughly live without a
 * realtime channel — Phase 2/3 (#9) can later swap polling for Web Push/SSE.
 * Never throws: a failed/logged-out fetch yields 0 (the bell just hides).
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
