'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';

interface SettlementSummaryProps {
    totalExpenses: number;
}

export default function SettlementSummary({ totalExpenses }: SettlementSummaryProps) {
    const t = useTranslations('settlement');

    return (
        <Card className="mb-6 bg-gradient-to-br from-indigo-500 to-purple-600 border-none shadow-lg">
            <CardContent className="pt-6 text-white text-center sm:text-left">
                <h3 className="text-lg font-semibold opacity-90 mb-1">
                    {t('totalExpenses')}
                </h3>
                <p className="text-4xl font-bold tracking-tight">
                    ${totalExpenses.toLocaleString()}
                </p>
            </CardContent>
        </Card>
    );
}
