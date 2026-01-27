import { Card, CardContent, Typography, Button } from '@mui/material';
import { Delete } from '@mui/icons-material';
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
                    startIcon={<Delete />}
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
