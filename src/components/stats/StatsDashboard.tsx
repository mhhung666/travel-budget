import {
    Box,
    Container,
    Alert,
    Grid,
    useTheme,
    CircularProgress,
} from '@mui/material';
import { useTranslations, useLocale } from 'next-intl';
import { StatsSummaryCard, DateRangeFilter, CategoryStats, CountryStats, ExpenseHistogram } from './';
import type { StatsData } from '@/types';

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
    const theme = useTheme();

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

    const cardGradient = theme.palette.mode === 'dark'
        ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
        : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';

    if (loading && !stats) {
        return (
            <Box
                sx={{
                    minHeight: '60vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <CircularProgress size={60} thickness={4} />
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ pt: { xs: 12, sm: 14 } }}>
            <Box
                sx={{
                    animation: 'fadeIn 0.6s ease-out',
                    '@keyframes fadeIn': {
                        '0%': { opacity: 0, transform: 'translateY(20px)' },
                        '100%': { opacity: 1, transform: 'translateY(0)' },
                    },
                }}
            >
                {error && (
                    <Alert severity="error" sx={{ mb: 4, borderRadius: 3 }}>
                        {error}
                    </Alert>
                )}

                {/* 總支出和查詢區間卡片 */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid size={{ xs: 12, md: 5 }}>
                        <StatsSummaryCard
                            totalAmount={stats?.totalAmount || 0}
                            totalExpenses={stats?.totalExpenses || 0}
                            formatCurrency={formatCurrency}
                            t={t}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, md: 7 }}>
                        <DateRangeFilter
                            startDate={startDate}
                            endDate={endDate}
                            onStartDateChange={onStartDateChange}
                            onEndDateChange={onEndDateChange}
                            onYearSelect={onYearSelect}
                            t={t}
                        />
                    </Grid>
                </Grid>

                <ExpenseHistogram
                    categoryStats={stats?.categoryStats || []}
                    startDate={startDate}
                    endDate={endDate}
                    formatCurrency={formatCurrency}
                    cardGradient={cardGradient}
                    t={t}
                    locale={locale}
                />

                <Grid container spacing={4}>
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <CategoryStats
                            categoryStats={stats?.categoryStats || []}
                            cardGradient={cardGradient}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                            t={t}
                            tCategory={tCategory}
                        />
                    </Grid>

                    <Grid size={{ xs: 12, lg: 6 }}>
                        <CountryStats
                            countries={stats?.countries || []}
                            cardGradient={cardGradient}
                            t={t}
                        />
                    </Grid>
                </Grid>
            </Box>
        </Container>
    );
}
