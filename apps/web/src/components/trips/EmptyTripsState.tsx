'use client';

import { Luggage, Plus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';

export default function EmptyTripsState({
  onCreate,
  onJoin,
  disabled = false,
}: {
  onCreate: () => void;
  onJoin: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('trips');

  return (
    <EmptyState
      icon={Luggage}
      title={t('noTrips')}
      description={t('noTripsDescription')}
      action={
        <div className="flex w-full max-w-xs flex-col gap-2 sm:w-auto sm:max-w-none sm:flex-row">
          <Button
            onClick={onCreate}
            disabled={disabled}
            className="min-h-12 whitespace-normal gap-2"
          >
            <Plus className="h-4 w-4" />
            {t('createFirstTrip')}
          </Button>
          <Button
            onClick={onJoin}
            disabled={disabled}
            variant="ghost"
            className="min-h-12 whitespace-normal gap-2"
          >
            <UserPlus className="h-4 w-4" />
            {t('joinTrip')}
          </Button>
        </div>
      }
    />
  );
}
