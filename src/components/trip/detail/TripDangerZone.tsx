import { Card, CardContent, Typography, Button } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface TripDangerZoneProps {
    onDelete: () => void;
}

export default function TripDangerZone({ onDelete }: TripDangerZoneProps) {
    const tTrip = useTranslations('trip');

    return (
        <Card
            elevation={2}
            sx={{ mt: 3, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}
        >
            <CardContent>
                <Typography variant="subtitle2" color="error" gutterBottom fontWeight={600}>
                    {tTrip('dangerZone')}
                </Typography>
                <Button
                    variant="outlined"
                    color="error"
                    startIcon={<Trash2 size={20} />}
                    fullWidth
                    onClick={onDelete}
                >
                    {tTrip('deleteTrip')}
                </Button>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mt: 1 }}
                >
                    {tTrip('deleteWarning')}
                </Typography>
            </CardContent>
        </Card>
    );
}
