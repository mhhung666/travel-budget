'use server';
import { withAuth } from './withAuth';
import type { ActionResult } from './types';
import type { FriendsData, FriendshipStatus } from '@/types';
import { logger } from '@/lib/logger';
import {
  FriendshipError,
  readFriends,
  inviteFriend,
  acceptFriend,
  deleteFriend,
} from '@/lib/friends';
function failure(error: unknown): ActionResult<never> {
  if (error instanceof FriendshipError)
    return {
      success: false,
      error: error.code,
      code:
        error.code === 'ALREADY_FRIENDS' || error.code === 'REQUEST_PENDING'
          ? 'CONFLICT'
          : error.code,
    };
  logger.error('Friend operation failed');
  return { success: false, error: 'INTERNAL_ERROR', code: 'INTERNAL_ERROR' };
}
export const getFriends = withAuth(async (session): Promise<ActionResult<FriendsData>> => {
  try {
    return { success: true, data: await readFriends(session.userId) };
  } catch (error) {
    return failure(error);
  }
});
export const sendFriendRequest = withAuth(
  async (session, targetUserId: string): Promise<ActionResult<{ status: FriendshipStatus }>> => {
    try {
      return { success: true, data: await inviteFriend(session.userId, targetUserId) };
    } catch (error) {
      return failure(error);
    }
  }
);
export const acceptFriendRequest = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ status: FriendshipStatus }>> => {
    try {
      return { success: true, data: await acceptFriend(session.userId, friendshipId) };
    } catch (error) {
      return failure(error);
    }
  }
);
export const declineFriendRequest = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      return { success: true, data: await deleteFriend(session.userId, friendshipId, 'cancel') };
    } catch (error) {
      return failure(error);
    }
  }
);
export const removeFriend = withAuth(
  async (session, friendshipId: string): Promise<ActionResult<{ deleted: true }>> => {
    try {
      return { success: true, data: await deleteFriend(session.userId, friendshipId, 'remove') };
    } catch (error) {
      return failure(error);
    }
  }
);
