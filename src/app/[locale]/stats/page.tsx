'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import { StatsDashboard } from '@/components/stats';
import type { StatsData } from '@/types';
import { getCurrentUser, getStats } from '@/actions';
import { Loader2 } from 'lucide-react';

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-16 h-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
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
    </div>
  );
}
