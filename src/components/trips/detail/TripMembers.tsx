'use client';

import { ChevronDown, ChevronUp, UserPlus, Shield, UserMinus, ShieldCheck, Link } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Member, User } from '@/types';

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface TripMembersProps {
    members: Member[];
    currentUser: User | null;
    isCurrentUserAdmin: boolean;
    onAddVirtualMember: () => void;
    onRemoveMember: (member: Member) => void;
    onToggleAdmin: (member: Member) => void;
    onCopyInviteLink: (member: Member) => void;
    onVirtualMemberClick?: (member: Member) => void;
    expanded: boolean;
    onToggleExpand: () => void;
}

export default function TripMembers({
    members,
    currentUser,
    isCurrentUserAdmin,
    onAddVirtualMember,
    onRemoveMember,
    onToggleAdmin,
    onCopyInviteLink,
    onVirtualMemberClick,
    expanded,
    onToggleExpand,
}: TripMembersProps) {
    const tMember = useTranslations('member');
    const tCommon = useTranslations('common');

    return (
        <Card>
            <Collapsible
                open={expanded}
                onOpenChange={onToggleExpand}
            >
                <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                    <CollapsibleTrigger asChild>
                        <div className="flex justify-between items-center cursor-pointer group">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-xl font-semibold">
                                    {tMember('title')}
                                </CardTitle>
                                <Badge variant="secondary" className="px-2 py-0.5 min-w-[1.5rem] justify-center">
                                    {members.length}
                                </Badge>
                            </div>
                            <Button variant="ghost" size="sm" className="w-9 p-0">
                                {expanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                ) : (
                                    <ChevronDown className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="pt-0 p-4 sm:p-6">
                        {/* 新增虛擬成員按鈕 */}
                        {isCurrentUserAdmin && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onAddVirtualMember}
                                className="w-full mb-4"
                            >
                                <UserPlus className="mr-2 h-4 w-4" />
                                {tMember('addVirtualMember')}
                            </Button>
                        )}

                        <div className="space-y-3">
                            {members.map((member) => {
                                const isClickableVirtual = !currentUser && member.is_virtual && onVirtualMemberClick;
                                return (
                                    <div
                                        key={member.id}
                                        onClick={isClickableVirtual ? () => onVirtualMemberClick(member) : undefined}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border transition-all",
                                            member.is_virtual ? "bg-muted/50 border-dashed" : "bg-card border-border",
                                            isClickableVirtual ? "cursor-pointer hover:border-primary hover:bg-muted" : ""
                                        )}
                                    >
                                        <Avatar className={cn(
                                            "h-10 w-10",
                                            member.is_virtual ? "bg-muted" : "bg-primary"
                                        )}>
                                            {/* <AvatarImage src={member.avatar_url || ''} /> Member type doesn't have avatar_url yet */}
                                            <AvatarFallback className={cn(
                                                "text-white font-medium",
                                                member.is_virtual ? "bg-gray-400" : "bg-primary"
                                            )}>
                                                {member.display_name.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium truncate">
                                                    {member.display_name}
                                                </span>
                                                {member.role === 'admin' && (
                                                    <Badge variant="default" className="gap-1 px-1.5 h-5 text-[10px]">
                                                        <Shield className="h-3 w-3" />
                                                        {tMember('role.admin')}
                                                    </Badge>
                                                )}
                                                {member.is_virtual && (
                                                    <Badge variant="outline" className="h-5 text-[10px]">
                                                        {tMember('role.virtual')}
                                                    </Badge>
                                                )}
                                            </div>
                                            {!member.is_virtual && (
                                                <p className="text-xs text-muted-foreground truncate">
                                                    @{member.username}
                                                </p>
                                            )}
                                            {isClickableVirtual && (
                                                <p className="text-xs text-primary font-medium mt-0.5">
                                                    {tMember('convertVirtual.clickHint')}
                                                </p>
                                            )}
                                        </div>

                                        {/* 管理員操作按鈕 - 僅管理員且不是自己 */}
                                        {isCurrentUserAdmin && member.id !== currentUser?.id && (
                                            <div className="flex gap-1 shrink-0">
                                                <TooltipProvider>
                                                    {/* 切換管理員權限 - 僅限非虛擬成員 */}
                                                    {!member.is_virtual && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onToggleAdmin(member);
                                                                    }}
                                                                >
                                                                    {member.role === 'admin' ? (
                                                                        <Shield className="h-4 w-4 text-orange-500" />
                                                                    ) : (
                                                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                                                    )}
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{member.role === 'admin' ? tMember('demoteFromAdmin') : tMember('promoteToAdmin')}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}

                                                    {/* 複製邀請連結 - 僅限虛擬成員 */}
                                                    {member.is_virtual && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onCopyInviteLink(member);
                                                                    }}
                                                                >
                                                                    <Link className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>{tMember('copyInviteLink')}</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}

                                                    {/* 移除成員 */}
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onRemoveMember(member);
                                                                }}
                                                            >
                                                                <UserMinus className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{tCommon('delete')}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
