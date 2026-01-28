'use client';

import { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Box,
    Alert,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { createTrip } from '@/actions';

interface CreateTripDialogProps {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function CreateTripDialog({ open, onClose, onSuccess }: CreateTripDialogProps) {
    const t = useTranslations('trips');
    const tCommon = useTranslations('common');

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
    });
    const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
    const [error, setError] = useState('');

    const handleClose = () => {
        setError('');
        setFormData({ name: '', description: '', start_date: '', end_date: '' });
        setSelectedLocation(null);
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const result = await createTrip({
                ...formData,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                location: selectedLocation || null,
            });

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
            <DialogTitle>{t('create.title')}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        fullWidth
                        label={t('create.name')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        fullWidth
                        label={t('create.description')}
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        multiline
                        rows={3}
                        sx={{ mb: 2 }}
                    />

                    {/* 旅遊地點 */}
                    <LocationAutocomplete
                        value={selectedLocation}
                        onChange={setSelectedLocation}
                        label={t('create.location')}
                        placeholder={t('create.locationPlaceholder')}
                        helperText={t('create.locationHelp')}
                    />

                    {/* 旅遊時間區間 */}
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <TextField
                            fullWidth
                            label={t('create.startDate')}
                            type="date"
                            value={formData.start_date}
                            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            slotProps={{
                                inputLabel: { shrink: true },
                            }}
                        />
                        <TextField
                            fullWidth
                            label={t('create.endDate')}
                            type="date"
                            value={formData.end_date}
                            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                            slotProps={{
                                inputLabel: { shrink: true },
                                htmlInput: { min: formData.start_date || undefined },
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button type="submit" variant="contained">
                        {tCommon('create')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
