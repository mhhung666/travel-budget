import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Typography,
    Button
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { Member } from '@/types';

interface RemoveMemberDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    member: Member | null;
}

export default function RemoveMemberDialog({
    open,
    onClose,
    onConfirm,
    member,
}: RemoveMemberDialogProps) {
    const tTrip = useTranslations('trip');
    const tCommon = useTranslations('common');
    const tMember = useTranslations('member');

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{tTrip('removeMember')}</DialogTitle>
            <DialogContent>
                <Typography>{tTrip('removeMemberConfirm', { name: member?.display_name ?? '' })}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {tTrip('removeMemberNote')}
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{tCommon('cancel')}</Button>
                <Button
                    onClick={onConfirm}
                    color="error"
                    variant="contained"
                >
                    {tMember('remove')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
