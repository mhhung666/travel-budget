import { Card, CardContent, Button, Typography } from '@mui/material';
import { Calculator } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface TripSettlementProps {
    tripId: string;
}

export default function TripSettlement({ tripId }: TripSettlementProps) {
    const router = useRouter();
    const tTrip = useTranslations('trip');

    return (
        <Card elevation={2}>
            <CardContent>
                <Button
                    onClick={() => router.push(`/trips/${tripId}/settlement`)}
                    variant="contained"
                    color="success"
                    fullWidth
                    size="large"
                    startIcon={<Calculator size={20} />}
                    sx={{ py: 1.5, fontWeight: 600 }}
                >
                    {tTrip('viewSettlement')}
                </Button>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    textAlign="center"
                    display="block"
                    sx={{ mt: 1 }}
                >
                    {tTrip('viewSettlementHint')}
                </Typography>
            </CardContent>
        </Card>
    );
}
