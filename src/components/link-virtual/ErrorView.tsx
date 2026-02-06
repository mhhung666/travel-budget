import { Card, CardContent, Alert, Button } from '@mui/material';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface ErrorViewProps {
    error: string;
}

export default function ErrorView({ error }: ErrorViewProps) {
    const router = useRouter();
    const tError = useTranslations('error');

    return (
        <Card>
            <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
                <Button
                    variant="contained"
                    onClick={() => router.push('/')}
                    size="large"
                >
                    {tError('goBack')}
                </Button>
            </CardContent>
        </Card>
    );
}
