/**
 * 好友關係狀態（Friendship 狀態機，見 src/models/Friendship.ts）
 */
export type FriendshipStatus = 'pending' | 'accepted';

/**
 * 好友清單 / 邀請項目：一段關係 + 對方使用者的展示欄位
 */
export interface FriendItem {
  /** Friendship 文件 id */
  id: string;
  status: FriendshipStatus;
  /** 這段關係是否由我發出（pending 時區分「送出」與「收到」） */
  requested_by_me: boolean;
  /** 對方使用者 */
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string | null;
  };
  created_at: string;
}

/**
 * getFriends 回傳：已成立好友 + 收到 / 送出的 pending 邀請
 */
export interface FriendsData {
  friends: FriendItem[];
  incoming: FriendItem[];
  outgoing: FriendItem[];
}
