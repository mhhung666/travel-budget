'use client';

import { Box, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';

export default function EmptyTripsState() {
    const t = useTranslations('trips');

    return (
        <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
                {t('noTrips')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {t('noTripsDescription')}
            </Typography>
        </Box>
    );
}
