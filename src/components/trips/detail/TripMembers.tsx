import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Chip,
    IconButton,
    Collapse,
    Avatar,
} from '@mui/material';
import { ChevronDown, ChevronUp, UserPlus, Shield, UserMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Member } from '@/types';

interface TripMembersProps {
    members: Member[];
    currentUser: any;
    isCurrentUserAdmin: boolean;
    onAddVirtualMember: () => void;
    onRemoveMember: (member: Member) => void;
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
    onVirtualMemberClick,
    expanded,
    onToggleExpand,
}: TripMembersProps) {
    const tMember = useTranslations('member');

    return (
        <Card elevation={2}>
            <CardContent>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        mb: expanded ? 2 : 0,
                    }}
                    onClick={onToggleExpand}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                            {tMember('title')}
                        </Typography>
                        <Chip label={members.length} size="small" color="primary" />
                    </Box>
                    <IconButton size="small">
                        {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </IconButton>
                </Box>
                <Collapse in={expanded}>
                    {/* 新增虛擬成員按鈕 */}
                    {isCurrentUserAdmin && (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<UserPlus size={20} />}
                            onClick={onAddVirtualMember}
                            sx={{ mb: 2 }}
                            fullWidth
                        >
                            {tMember('addVirtualMember')}
                        </Button>
                    )}

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {members.map((member) => {
                            const isClickableVirtual = !currentUser && member.is_virtual && onVirtualMemberClick;
                            return (
                            <Box
                                key={member.id}
                                onClick={isClickableVirtual ? () => onVirtualMemberClick(member) : undefined}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2,
                                    p: 1.5,
                                    bgcolor: member.is_virtual ? 'action.hover' : 'background.default',
                                    borderRadius: 1,
                                    border: member.is_virtual ? '1px dashed' : 'none',
                                    borderColor: isClickableVirtual ? 'primary.main' : 'divider',
                                    cursor: isClickableVirtual ? 'pointer' : 'default',
                                    transition: 'all 0.2s',
                                    '&:hover': isClickableVirtual ? {
                                        bgcolor: 'action.selected',
                                        borderColor: 'primary.main',
                                    } : {},
                                }}
                            >
                                <Avatar sx={{ bgcolor: member.is_virtual ? 'grey.400' : 'primary.main' }}>
                                    {member.display_name.charAt(0)}
                                </Avatar>
                                <Box sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Typography variant="body1" fontWeight={500}>
                                            {member.display_name}
                                        </Typography>
                                        {member.role === 'admin' && (
                                            <Chip
                                                label={tMember('role.admin')}
                                                size="small"
                                                color="primary"
                                                icon={<Shield size={16} />}
                                            />
                                        )}
                                        {member.is_virtual && (
                                            <Chip
                                                label={tMember('role.virtual')}
                                                size="small"
                                                variant="outlined"
                                            />
                                        )}
                                    </Box>
                                    {!member.is_virtual && (
                                        <Typography variant="body2" color="text.secondary">
                                            @{member.username}
                                        </Typography>
                                    )}
                                    {isClickableVirtual && (
                                        <Typography variant="caption" color="primary.main">
                                            {tMember('convertVirtual.clickHint')}
                                        </Typography>
                                    )}
                                </Box>
                                {/* 移除按鈕 - 僅管理員且不是自己 */}
                                {isCurrentUserAdmin && member.id !== currentUser?.id && (
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveMember(member);
                                        }}
                                    >
                                        <UserMinus size={20} />
                                    </IconButton>
                                )}
                            </Box>
                        );
                        })}
                    </Box>
                </Collapse>
            </CardContent>
        </Card>
    );
}
