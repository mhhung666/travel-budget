'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addVirtualMember, addFriendsToTrip, removeMember, updateMemberRole } from '@/actions';
import type { ActionResult } from '@/actions';
import { tripKeys } from './keys';
import { clearTripAccessModes } from './fetcher';

async function unwrap<T>(p: Promise<ActionResult<T>>): Promise<T> {
  const result = await p;
  if (!result.success) throw new Error(result.error);
  return result.data;
}

/**
 * Member management mutations (add virtual / remove / toggle role).
 *
 * Membership changes ripple through most trip views, so on success these
 * invalidate the members, detail (member count), expenses, settlement queries
 * for this trip plus the cross-trip list. Keeps the React-Query-backed pages
 * consistent after edits made on the settings page.
 */
export function useMemberMutations(tripId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    clearTripAccessModes();
    queryClient.invalidateQueries({ queryKey: tripKeys.shell(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.members(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.detail(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.expenses(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.settlement(tripId) });
    queryClient.invalidateQueries({ queryKey: tripKeys.list });
  };

  const addVirtual = useMutation({
    mutationFn: (displayName: string) =>
      unwrap(addVirtualMember(tripId, { display_name: displayName.trim() })),
    onSuccess: invalidate,
  });

  // 從好友一次挑選多人加入（ROADMAP #12 Phase 3）
  const addFriends = useMutation({
    mutationFn: (friendIds: string[]) =>
      unwrap(addFriendsToTrip(tripId, { friend_ids: friendIds })),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (memberId: string) => unwrap(removeMember(tripId, memberId)),
    onSuccess: invalidate,
  });

  const toggleRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: 'admin' | 'member' }) =>
      unwrap(updateMemberRole(tripId, memberId, role)),
    onSuccess: invalidate,
  });

  return { addVirtual, addFriends, remove, toggleRole };
}
