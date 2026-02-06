import { Card, CardContent, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import type { Trip, Member } from '@/types';

interface InviteCardProps {
    trip: Trip | null;
    virtualMember: Member | null;
}

export default function InviteCard({ trip, virtualMember }: InviteCardProps) {
    const t = useTranslations('member.convertVirtual');

    return (
        <Card>
            <CardContent sx={{ py: 4 }}>
                <Typography variant="h5" fontWeight={600} gutterBottom align="center">
                    {t('inviteTitle', { tripName: trip?.name || '' })}
                </Typography>
                <Typography variant="body1" color="text.secondary" align="center" sx={{ mt: 2 }}>
                    {t('inviteDescription', { memberName: virtualMember?.display_name || '' })}
                </Typography>
            </CardContent>
        </Card>
    );
}
