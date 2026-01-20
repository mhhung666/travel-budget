'use client';

import { Box, Typography, Chip, Avatar, IconButton } from '@mui/material';
import { AdminPanelSettings, PersonRemove } from '@mui/icons-material';
import type { Member } from '@/services/member.service';

export interface MemberCardProps {
  member: Member;
  isCurrentUser?: boolean;
  canRemove?: boolean;
  onRemove?: (member: Member) => void;
}

/**
 * Member card component displaying member info
 *
 * @example
 * <MemberCard
 *   member={member}
 *   isCurrentUser={member.id === currentUser.id}
 *   canRemove={isAdmin && member.id !== currentUser.id}
 *   onRemove={handleRemove}
 * />
 */
export function MemberCard({ member, isCurrentUser, canRemove, onRemove }: MemberCardProps) {
  const displayName = member.display_name || member.username;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1,
        px: 2,
        borderRadius: 1,
        bgcolor: isCurrentUser ? 'action.selected' : 'transparent',
        '&:hover': {
          bgcolor: 'action.hover',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ bgcolor: 'primary.main' }}>{displayName.charAt(0).toUpperCase()}</Avatar>
        <Box>
          <Typography variant="body1" fontWeight={isCurrentUser ? 600 : 400}>
            {displayName}
            {isCurrentUser && (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (You)
              </Typography>
            )}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Joined {new Date(member.joined_at).toLocaleDateString()}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {member.role === 'admin' && (
          <Chip
            icon={<AdminPanelSettings />}
            label="Admin"
            size="small"
            color="primary"
            variant="outlined"
          />
        )}
        {canRemove && onRemove && (
          <IconButton
            size="small"
            color="error"
            onClick={() => onRemove(member)}
            title="Remove member"
          >
            <PersonRemove />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}
