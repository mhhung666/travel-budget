'use client';

import { Box, Typography, Divider } from '@mui/material';
import { MemberCard } from './MemberCard';
import type { Member } from '@/services/member.service';

export interface MemberListProps {
  members: Member[];
  currentUserId?: number;
  isAdmin?: boolean;
  onRemove?: (member: Member) => void;
  title?: string;
}

/**
 * Member list component
 *
 * @example
 * <MemberList
 *   members={members}
 *   currentUserId={user.id}
 *   isAdmin={isAdmin}
 *   onRemove={handleRemoveMember}
 *   title="Trip Members"
 * />
 */
export function MemberList({
  members,
  currentUserId,
  isAdmin,
  onRemove,
  title = 'Members',
}: MemberListProps) {
  return (
    <Box>
      {title && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          {title} ({members.length})
        </Typography>
      )}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {members.map((member, index) => (
          <Box key={member.id}>
            <MemberCard
              member={member}
              isCurrentUser={member.id === currentUserId}
              canRemove={isAdmin && member.id !== currentUserId && member.role !== 'admin'}
              onRemove={onRemove}
            />
            {index < members.length - 1 && <Divider />}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
