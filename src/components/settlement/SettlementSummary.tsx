import { Card, CardContent, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';

interface SettlementSummaryProps {
    totalExpenses: number;
}

export default function SettlementSummary({ totalExpenses }: SettlementSummaryProps) {
    const t = useTranslations('settlement');

    return (
        <Card
            elevation={3}
            sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                mb: 3,
            }}
        >
            <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>
                    {t('totalExpenses')}
                </Typography>
                <Typography variant="h3" fontWeight={700}>
                    ${totalExpenses.toLocaleString()}
                </Typography>
            </CardContent>
        </Card>
    );
}
