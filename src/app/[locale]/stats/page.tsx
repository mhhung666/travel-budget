'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import {
  Box,
  Container,
  Alert,
  CircularProgress,
  useTheme,
  Grid,
} from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import { StatsSummaryCard, DateRangeFilter, CategoryStats, CountryStats, ExpenseHistogram } from '@/components/stats';
import type { StatsData } from '@/types';
import { getCurrentUser, getStats } from '@/actions';

export default function StatsPage() {
  const router = useRouter();
  const t = useTranslations('stats');
  const tCategory = useTranslations('category');
  const locale = useLocale();
  const theme = useTheme();

  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadStatsData();
    }
  }, [user, startDate, endDate]);

  const loadUser = async () => {
    try {
      const result = await getCurrentUser();
      if (result.success && result.data) {
        setUser(result.data);
      } else {
        router.push('/login');
      }
    } catch (error) {
      console.error('Load user error:', error);
      router.push('/login');
    }
  };

  const loadStatsData = async () => {
    try {
      setLoading(true);
      const result = await getStats({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      setStats(result.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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

  const handleYearSelect = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  if (loading && !stats) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={60} thickness={4} />
      </Box>
    );
  }

  const cardGradient = theme.palette.mode === 'dark'
    ? 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 8 }}>
      <Navbar
        user={
          user
            ? {
              id: user.id,
              username: user.display_name || user.username,
              email: user.email,
            }
            : null
        }
        showUserMenu={true}
        title={t('title')}
      />

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
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                onYearSelect={handleYearSelect}
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
    </Box>
  );
}
