'use client';

import { Separator } from '@/components/ui/separator';
import { MemberCard } from './MemberCard';
import type { Member } from '@/types';

export interface MemberListProps {
  members: Member[];
  currentUserId?: number;
  isAdmin?: boolean;
  onRemove?: (member: Member) => void;
  title?: string;
}

export function MemberList({
  members,
  currentUserId,
  isAdmin,
  onRemove,
  title = 'Members',
}: MemberListProps) {
  return (
    <div>
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          {title} ({members.length})
        </h3>
      )}
      <div className="flex flex-col space-y-1">
        {members.map((member, index) => (
          <div key={member.id}>
            <MemberCard
              member={member}
              isCurrentUser={member.id === currentUserId}
              canRemove={isAdmin && member.id !== currentUserId && member.role !== 'admin'}
              onRemove={onRemove}
            />
            {index < members.length - 1 && <Separator className="my-1 opacity-50" />}
          </div>
        ))}
      </div>
    </div>
  );
}
