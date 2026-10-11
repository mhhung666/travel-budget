import { friendsSchema } from '@travel-budget/contracts';
import {
  readFriends,
  inviteFriend,
  acceptFriend,
  deleteFriend,
  FriendshipError,
} from '@/lib/friends';
import { ApiError } from './http';
export async function readMobileFriends(actorId: string) {
  const data = await readFriends(actorId);
  const convert = (item: (typeof data.friends)[number]) => ({
    id: item.id,
    status: item.status,
    requestedByMe: item.requested_by_me,
    user: {
      id: item.user.id,
      username: item.user.username,
      displayName: item.user.display_name,
      avatarUrl: item.user.avatar_url ?? null,
    },
    createdAt: item.created_at,
  });
  return friendsSchema.parse({
    friends: data.friends.map(convert),
    incoming: data.incoming.map(convert),
    outgoing: data.outgoing.map(convert),
  });
}
export async function friendOperation(
  actorId: string,
  operation: 'invite' | 'accept' | 'decline' | 'withdraw' | 'remove',
  id: string
) {
  try {
    if (operation === 'invite') return await inviteFriend(actorId, id);
    if (operation === 'accept') return await acceptFriend(actorId, id);
    await deleteFriend(actorId, id, operation);
    return { status: 'deleted' as const };
  } catch (error) {
    if (error instanceof FriendshipError)
      throw new ApiError(
        error.code === 'NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 409,
        error.code
      );
    throw error;
  }
}
