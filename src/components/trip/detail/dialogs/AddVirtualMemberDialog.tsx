import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Typography,
    CircularProgress,
    Alert
} from '@mui/material';
import { useTranslations } from 'next-intl';

interface AddVirtualMemberDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (name: string) => Promise<void>;
}

export default function AddVirtualMemberDialog({
    open,
    onClose,
    onSubmit,
}: AddVirtualMemberDialogProps) {
    const tMember = useTranslations('member');
    const tCommon = useTranslations('common');

    const [name, setName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setError('');
        }
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        setIsAdding(true);
        setError('');

        try {
            await onSubmit(name);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsAdding(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>{tMember('addVirtualMember')}</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {tMember('addVirtualMemberHint')}
                    </Typography>
                    <TextField
                        fullWidth
                        label={tMember('virtualMemberName')}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoFocus
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={isAdding || !name.trim()}
                        startIcon={isAdding ? <CircularProgress size={16} /> : null}
                    >
                        {tCommon('add')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
