import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
            <CardContent className="text-center p-6 sm:p-8">
                <Alert variant="destructive" className="mb-6">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button
                    onClick={() => router.push('/')}
                    size="lg"
                    className="w-full sm:w-auto"
                >
                    {tError('goBack')}
                </Button>
            </CardContent>
        </Card>
    );
}
