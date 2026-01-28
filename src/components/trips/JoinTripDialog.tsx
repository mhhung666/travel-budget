'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Alert,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import { joinTrip } from '@/actions';

interface JoinTripDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function JoinTripDialog({ open, onClose, onSuccess }: JoinTripDialogProps) {
    const t = useTranslations('trips');
    const tCommon = useTranslations('common');

    const [joinTripId, setJoinTripId] = useState('');
    const [error, setError] = useState('');

    const handleClose = () => {
        setError('');
        setJoinTripId('');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const result = await joinTrip(joinTripId);

            if (!result.success) {
                throw new Error(result.error);
            }

            handleClose();
            onSuccess();
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle>{t('join.title')}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        fullWidth
                        label={t('join.tripId')}
                        value={joinTripId}
                        onChange={(e) => setJoinTripId(e.target.value)}
                        required
                        placeholder={t('join.tripIdPlaceholder')}
                        helperText={t('join.tripIdHelp')}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" variant="contained">
                        {t('join.joinButton')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
