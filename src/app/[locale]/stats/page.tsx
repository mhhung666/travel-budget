'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Box, CircularProgress } from '@mui/material';
import Navbar from '@/components/layout/Navbar';
import { StatsDashboard } from '@/components/stats';
import type { StatsData } from '@/types';
import { getCurrentUser, getStats } from '@/actions';

export default function StatsPage() {
  const router = useRouter();
  const t = useTranslations('stats');

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

      <StatsDashboard
        stats={stats}
        loading={loading}
        error={error}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onYearSelect={handleYearSelect}
      />
    </Box>
  );
}
