'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Shield, UserMinus } from 'lucide-react';
import type { Member } from '@/types';
import { cn } from '@/lib/utils';

export interface MemberCardProps {
  member: Member;
  isCurrentUser?: boolean;
  canRemove?: boolean;
  onRemove?: (member: Member) => void;
}

export function MemberCard({ member, isCurrentUser, canRemove, onRemove }: MemberCardProps) {
  const displayName = member.display_name || member.username;

  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 px-4 rounded-md hover:bg-muted/50 transition-colors",
        isCurrentUser && "bg-muted/50 font-medium"
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className={isCurrentUser ? "font-semibold" : "font-normal"}>
              {displayName}
            </span>
            {isCurrentUser && (
              <span className="text-xs text-muted-foreground">(You)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Joined {new Date(member.joined_at).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {member.role === 'admin' && (
          <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
            <Shield size={12} />
            Admin
          </Badge>
        )}
        {canRemove && onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(member)}
            title="Remove member"
          >
            <UserMinus size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}
