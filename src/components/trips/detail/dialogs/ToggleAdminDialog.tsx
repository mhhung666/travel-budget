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

interface ToggleAdminDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    member: Member | null;
}

export default function ToggleAdminDialog({
    open,
    onClose,
    onConfirm,
    member,
}: ToggleAdminDialogProps) {
    const tCommon = useTranslations('common');
    const tMember = useTranslations('member');

    const isPromoting = member?.role !== 'admin';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isPromoting ? tMember('promoteToAdmin') : tMember('demoteFromAdmin')}
            </DialogTitle>
            <DialogContent>
                <Typography>
                    {isPromoting
                        ? tMember('confirm.promoteToAdmin')
                        : tMember('confirm.demoteFromAdmin')
                    }
                </Typography>
                {isPromoting && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        {tMember('confirm.promoteMessage')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{tCommon('cancel')}</Button>
                <Button
                    onClick={onConfirm}
                    color={isPromoting ? 'primary' : 'warning'}
                    variant="contained"
                >
                    {tCommon('confirm')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
