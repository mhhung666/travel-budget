'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFriends,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '@/actions';
import type { ActionResult } from '@/actions';
import type { FriendsData } from '@/types';
import { friendKeys } from './keys';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  // error 字串是穩定代碼（ALREADY_FRIENDS / REQUEST_PENDING / NOT_FOUND …），
  // 前端拿 message 對 friends.errors.* i18n 表
  if (!result.success) throw new Error(result.error);
  return result.data;
}

const EMPTY_FRIENDS: FriendsData = { friends: [], incoming: [], outgoing: [] };

/**
 * 我的好友總覽（好友 + 收到 / 送出的 pending 邀請）。
 * 設定頁好友卡片與旅程成員頁的加好友按鈕共用同一個 key，
 * 任一處的 mutation 都會讓兩邊一起更新。
 */
export function useFriends(enabled = true) {
  return useQuery({
    queryKey: friendKeys.all,
    queryFn: async (): Promise<FriendsData> => {
      const res = await getFriends();
      return res.success ? res.data : EMPTY_FRIENDS;
    },
    enabled,
  });
}

/**
 * 好友狀態機 mutations（邀請 / 接受 / 拒絕或收回 / 刪除）。
 * 成功後一律整包重抓：好友資料量小，不值得做細粒度快取手術。
 */
export function useFriendMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: friendKeys.all });

  const send = useMutation({
    mutationFn: (targetUserId: string) => unwrap(sendFriendRequest(targetUserId)),
    onSuccess: invalidate,
  });

  const accept = useMutation({
    mutationFn: (friendshipId: string) => unwrap(acceptFriendRequest(friendshipId)),
    onSuccess: invalidate,
  });

  const decline = useMutation({
    mutationFn: (friendshipId: string) => unwrap(declineFriendRequest(friendshipId)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (friendshipId: string) => unwrap(removeFriend(friendshipId)),
    onSuccess: invalidate,
  });

  return { send, accept, decline, remove };
}
