'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import { StatsDashboard } from '@/components/stats';
import { useCurrentUser, useStats } from '@/hooks/queries';

export default function StatsPage() {
  const router = useRouter();
  const t = useTranslations('stats');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: user, isSuccess: userResolved } = useCurrentUser();

  // Redirect to login once we know there is no authenticated user.
  useEffect(() => {
    if (userResolved && !user) {
      router.push('/login');
    }
  }, [userResolved, user, router]);

  const {
    data: stats = null,
    isFetching: loading,
    isError,
    error: statsError,
  } = useStats({ startDate, endDate }, !!user);

  const error = isError
    ? statsError instanceof Error
      ? statsError.message
      : String(statsError)
    : '';

  const handleYearSelect = (year: number) => {
    setStartDate(`${year}-01-01`);
    setEndDate(`${year}-12-31`);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <Navbar
        user={
          user
            ? {
                id: user.id,
                username: user.display_name || user.username,
                email: user.email,
                avatar_url: user.avatar_url,
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
