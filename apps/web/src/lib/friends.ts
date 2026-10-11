import { isValidObjectId } from 'mongoose';
import { dbConnect } from '@/lib/mongodb';
import { Friendship, friendshipPairKey, User } from '@/models';
import type { FriendItem, FriendsData, FriendshipStatus } from '@/types';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';

export class FriendshipError extends Error {
  constructor(
    public code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'ALREADY_FRIENDS' | 'REQUEST_PENDING'
  ) {
    super(code);
  }
}
type FriendUser = {
  _id: { toString(): string };
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  isVirtual?: boolean | null;
} | null;
type FriendRow = {
  _id: { toString(): string };
  requester: FriendUser;
  recipient: FriendUser;
  status: FriendshipStatus;
  createdAt: Date;
};
/** Authenticated actor only; friendships grant no trip authorization. Two batched populates. */
export async function readFriends(actorId: string): Promise<FriendsData> {
  await dbConnect();
  const rows = await Friendship.find({ $or: [{ requester: actorId }, { recipient: actorId }] })
    .populate('requester', 'username displayName avatarUrl isVirtual')
    .populate('recipient', 'username displayName avatarUrl isVirtual')
    .sort({ createdAt: -1, _id: -1 })
    .lean<FriendRow[]>();
  const data: FriendsData = { friends: [], incoming: [], outgoing: [] };
  for (const row of rows) {
    if (!row.requester || !row.recipient || row.requester.isVirtual || row.recipient.isVirtual)
      continue;
    const requestedByMe = row.requester._id.toString() === actorId;
    const other = requestedByMe ? row.recipient : row.requester;
    const item: FriendItem = {
      id: row._id.toString(),
      status: row.status,
      requested_by_me: requestedByMe,
      user: {
        id: other._id.toString(),
        username: other.username,
        display_name: other.displayName,
        avatar_url: other.avatarUrl ?? null,
      },
      created_at: row.createdAt.toISOString(),
    };
    if (row.status === 'accepted') data.friends.push(item);
    else if (requestedByMe) data.outgoing.push(item);
    else data.incoming.push(item);
  }
  return data;
}
async function sendNotice(
  actorId: string,
  recipientId: string,
  type: 'friend_request' | 'friend_accepted'
) {
  // The relationship is already committed. Secondary failures must not encourage resubmission.
  try {
    await notify({ actorId, type, recipientIds: [recipientId] });
  } catch {
    logger.error('Friend notification failed');
  }
}
type Existing = {
  _id: { toString(): string };
  status: FriendshipStatus;
  requester: { toString(): string };
};
async function resolveInvitation(actorId: string, pairKey: string, existing: Existing) {
  if (existing.status === 'accepted') throw new FriendshipError('ALREADY_FRIENDS');
  if (existing.requester.toString() === actorId) throw new FriendshipError('REQUEST_PENDING');
  const changed = await Friendship.updateOne(
    { _id: existing._id, pairKey, status: 'pending', recipient: actorId },
    { $set: { status: 'accepted' } }
  );
  // A parallel cancellation/acceptance must not be reported as our success or notify again.
  if (changed.matchedCount !== 1) throw new FriendshipError('NOT_FOUND');
  await sendNotice(actorId, existing.requester.toString(), 'friend_accepted');
  return { status: 'accepted' as const };
}
export async function inviteFriend(
  actorId: string,
  targetUserId: string
): Promise<{ status: FriendshipStatus }> {
  if (typeof targetUserId !== 'string' || !isValidObjectId(targetUserId))
    throw new FriendshipError('VALIDATION_ERROR');
  targetUserId = targetUserId.toLowerCase();
  if (targetUserId === actorId.toLowerCase()) throw new FriendshipError('VALIDATION_ERROR');
  await dbConnect();
  const target = await User.findById(targetUserId)
    .select('isVirtual')
    .lean<{ isVirtual?: boolean | null } | null>();
  if (!target) throw new FriendshipError('NOT_FOUND');
  if (target.isVirtual) throw new FriendshipError('VALIDATION_ERROR');
  const pairKey = friendshipPairKey(actorId, targetUserId);
  const existing = await Friendship.findOne({ pairKey })
    .select('status requester')
    .lean<Existing | null>();
  if (existing) return resolveInvitation(actorId, pairKey, existing);
  try {
    await Friendship.create({ requester: actorId, recipient: targetUserId });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    // Both directions may race on the unique pair. Re-read and follow the same state machine.
    const winner = await Friendship.findOne({ pairKey })
      .select('status requester')
      .lean<Existing | null>();
    if (!winner) throw new FriendshipError('NOT_FOUND');
    return resolveInvitation(actorId, pairKey, winner);
  }
  await sendNotice(actorId, targetUserId, 'friend_request');
  return { status: 'pending' };
}
export async function acceptFriend(actorId: string, friendshipId: string) {
  if (typeof friendshipId !== 'string' || !isValidObjectId(friendshipId))
    throw new FriendshipError('NOT_FOUND');
  await dbConnect();
  const updated = await Friendship.findOneAndUpdate(
    { _id: friendshipId, recipient: actorId, status: 'pending' },
    { $set: { status: 'accepted' } },
    { new: true }
  )
    .select('requester')
    .lean<{ requester: { toString(): string } } | null>();
  if (!updated) throw new FriendshipError('NOT_FOUND');
  await sendNotice(actorId, updated.requester.toString(), 'friend_accepted');
  return { status: 'accepted' as const };
}
export async function deleteFriend(
  actorId: string,
  friendshipId: string,
  action: 'decline' | 'withdraw' | 'cancel' | 'remove'
) {
  if (typeof friendshipId !== 'string' || !isValidObjectId(friendshipId))
    throw new FriendshipError('NOT_FOUND');
  await dbConnect();
  const result = await Friendship.deleteOne({
    _id: friendshipId,
    status: action === 'remove' ? 'accepted' : 'pending',
    ...(action === 'decline'
      ? { recipient: actorId }
      : action === 'withdraw'
        ? { requester: actorId }
        : { $or: [{ requester: actorId }, { recipient: actorId }] }),
  });
  if (result.deletedCount !== 1) throw new FriendshipError('NOT_FOUND');
  return { deleted: true as const };
}
