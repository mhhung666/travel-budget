'use client';

import { Plus, Calculator, CreditCard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';

export default function Features() {
    const t = useTranslations('home');

    const features = [
        {
            icon: Plus,
            titleKey: 'features.easyTracking.title',
            descKey: 'features.easyTracking.description',
        },
        {
            icon: Calculator,
            titleKey: 'features.smartSplit.title',
            descKey: 'features.smartSplit.description',
        },
        {
            icon: CreditCard,
            titleKey: 'features.quickSettlement.title',
            descKey: 'features.quickSettlement.description',
        },
    ];

    return (
        <div className="py-12 sm:py-16 bg-muted/30">
            <div className="container mx-auto px-4">
                <h3 className="text-3xl sm:text-4xl font-bold text-center mb-10 sm:mb-14 text-foreground">
                    {t('features.title')}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 px-2 sm:px-0">
                    {features.map((feature, index) => (
                        <Card
                            key={index}
                            className="h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-border/50 bg-card"
                        >
                            <CardContent className="text-center p-6 sm:p-8 pt-8 sm:pt-10">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary mb-6 shadow-sm">
                                    <feature.icon size={28} className="text-primary-foreground" />
                                </div>
                                <h4 className="text-xl sm:text-2xl font-semibold mb-3 text-card-foreground">
                                    {t(feature.titleKey)}
                                </h4>
                                <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
                                    {t(feature.descKey)}
                                </p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
