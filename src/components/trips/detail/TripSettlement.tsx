'use client';

import { Calculator } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface TripSettlementProps {
    tripId: string;
}

export default function TripSettlement({ tripId }: TripSettlementProps) {
    const router = useRouter();
    const tTrip = useTranslations('trip');

    return (
        <Card className="shadow-none border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
            <CardContent className="p-4 sm:p-6">
                <Button
                    onClick={() => router.push(`/trips/${tripId}/settlement`)}
                    className="w-full h-12 text-base font-semibold gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
                    size="lg"
                >
                    <Calculator className="h-5 w-5" />
                    {tTrip('viewSettlement')}
                </Button>
                <p className="text-xs text-center text-muted-foreground mt-2">
                    {tTrip('viewSettlementHint')}
                </p>
            </CardContent>
        </Card>
    );
}
