import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Box,
    Alert,
    TextField,
    Button,
    CircularProgress
} from '@mui/material';
import { useTranslations } from 'next-intl';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import { Trip } from '@/types';

interface EditTripDialogProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    trip: Trip | null;
}

export default function EditTripDialog({
    open,
    onClose,
    onSubmit,
    trip,
}: EditTripDialogProps) {
    const tTrip = useTranslations('trip');
    const tCommon = useTranslations('common');
    const tTrips = useTranslations('trips');

    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
    });
    const [location, setLocation] = useState<LocationOption | null>(null);

    useEffect(() => {
        if (open && trip) {
            setForm({
                name: trip.name,
                description: trip.description || '',
                start_date: trip.start_date || '',
                end_date: trip.end_date || '',
            });
            setLocation(trip.location ? {
                name: trip.location.name,
                display_name: trip.location.display_name,
                lat: trip.location.lat,
                lon: trip.location.lon,
                country: trip.location.country,
                country_code: trip.location.country_code,
            } : null);
            setError('');
        }
    }, [open, trip]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trip) return;
        setIsSaving(true);
        setError('');

        try {
            await onSubmit({ ...form, location });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>{tTrip('editTrip')}</DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <TextField
                        fullWidth
                        label={tTrips('create.name')}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        sx={{ mt: 1, mb: 2 }}
                    />

                    <TextField
                        fullWidth
                        label={tTrips('create.description')}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        multiline
                        rows={3}
                        sx={{ mb: 2 }}
                    />

                    {/* 旅遊地點 */}
                    <LocationAutocomplete
                        value={location}
                        onChange={setLocation}
                        label={tTrips('create.location')}
                        placeholder={tTrips('create.locationPlaceholder')}
                        helperText={tTrips('create.locationHelp')}
                    />

                    {/* 旅遊時間區間 */}
                    <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                        <TextField
                            fullWidth
                            label={tTrips('create.startDate')}
                            type="date"
                            value={form.start_date}
                            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                            slotProps={{
                                inputLabel: { shrink: true },
                            }}
                        />
                        <TextField
                            fullWidth
                            label={tTrips('create.endDate')}
                            type="date"
                            value={form.end_date}
                            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                            slotProps={{
                                inputLabel: { shrink: true },
                                htmlInput: { min: form.start_date || undefined },
                            }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={onClose}>
                        {tCommon('cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={isSaving || !form.name.trim()}
                        startIcon={isSaving ? <CircularProgress size={16} /> : null}
                    >
                        {tTrip('saveEdit')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
