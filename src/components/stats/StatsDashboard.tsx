'use client';

import { useTranslations, useLocale } from 'next-intl';
import StatsSummaryCard from './StatsSummaryCard';
import DateRangeFilter from './DateRangeFilter';
import CategoryStats from './CategoryStats';
import CountryStats from './CountryStats';
import ExpenseHistogram from './ExpenseHistogram';
import type { StatsData } from '@/types';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StatsDashboardProps {
    stats: StatsData | null;
    loading: boolean;
    error: string;
    startDate: string;
    endDate: string;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;
    onYearSelect: (year: number) => void;
}

export default function StatsDashboard({
    stats,
    loading,
    error,
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    onYearSelect,
}: StatsDashboardProps) {
    const t = useTranslations('stats');
    const tCategory = useTranslations('category');
    const locale = useLocale();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat(locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US', {
            style: 'currency',
            currency: 'TWD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString(
            locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : 'en-US'
        );
    };

    if (loading && !stats) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 pt-24 sm:pt-28 pb-12 max-w-7xl">
            <div className="animate-in fade-in slide-in-from-bottom-5 duration-500">
                {error && (
                    <Alert variant="destructive" className="mb-8 rounded-xl">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* 總支出和查詢區間卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
                    <div className="md:col-span-5 h-full">
                        <StatsSummaryCard
                            totalAmount={stats?.totalAmount || 0}
                            totalExpenses={stats?.totalExpenses || 0}
                            formatCurrency={formatCurrency}
                            t={t}
                        />
                    </div>
                    <div className="md:col-span-7 h-full">
                        <DateRangeFilter
                            startDate={startDate}
                            endDate={endDate}
                            onStartDateChange={onStartDateChange}
                            onEndDateChange={onEndDateChange}
                            onYearSelect={onYearSelect}
                            t={t}
                        />
                    </div>
                </div>

                <div className="mb-8">
                    <ExpenseHistogram
                        categoryStats={stats?.categoryStats || []}
                        startDate={startDate}
                        endDate={endDate}
                        formatCurrency={formatCurrency}
                        t={t}
                        locale={locale}
                        cardGradient="" // Ignored
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <CategoryStats
                            categoryStats={stats?.categoryStats || []}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                            t={t}
                            tCategory={tCategory}
                            cardGradient="" // Ignored
                        />
                    </div>

                    <div>
                        <CountryStats
                            countries={stats?.countries || []}
                            t={t}
                            cardGradient="" // Ignored
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
