import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    Typography,
    Box,
    Button,
    CircularProgress
} from '@mui/material';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DeleteTripDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    tripName?: string;
    isDeleting: boolean;
}

export default function DeleteTripDialog({
    open,
    onClose,
    onConfirm,
    tripName,
    isDeleting,
}: DeleteTripDialogProps) {
    const tTrip = useTranslations('trip');
    const tCommon = useTranslations('common');

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{tTrip('deleteConfirmTitle')}</DialogTitle>
            <DialogContent>
                <Alert severity="warning" sx={{ mb: 2 }} icon={<AlertTriangle size={24} />}>
                    {tTrip('deleteConfirmWarning')}
                </Alert>
                <Typography>{tTrip('deleteConfirmMessage', { name: tripName || '' })}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {tTrip('deleteConfirmDetails')}
                </Typography>
                <Box component="ul" sx={{ pl: 2, mt: 1 }}>
                    <Typography component="li" variant="body2">
                        {tTrip('deleteItem1')}
                    </Typography>
                    <Typography component="li" variant="body2">
                        {tTrip('deleteItem2')}
                    </Typography>
                    <Typography component="li" variant="body2">
                        {tTrip('deleteItem3')}
                    </Typography>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{tCommon('cancel')}</Button>
                <Button
                    onClick={onConfirm}
                    color="error"
                    variant="contained"
                    disabled={isDeleting}
                    startIcon={isDeleting ? <CircularProgress size={16} /> : <Trash2 size={20} />}
                >
                    {isDeleting ? tTrip('deleting') : tTrip('confirmDelete')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
