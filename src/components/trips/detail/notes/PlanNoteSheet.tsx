'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { useItinerary } from '@/hooks/queries';
import { ResponsiveFormSheet, EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';

export interface PlanNoteSheetProps {
  tripId: string;
  open: boolean;
  pending: boolean;
  onPickDay: (dayId: string) => void;
  onClose: () => void;
}

/**
 * 「加入行程」的行程日選擇器：列出旅程所有天，點一天即把筆記轉成該日活動。
 * 尚無任何行程日時顯示空狀態並深連結到行程分頁（先建天再回來轉）。
 */
export function PlanNoteSheet({ tripId, open, pending, onPickDay, onClose }: PlanNoteSheetProps) {
  const t = useTranslations('notes');
  const router = useRouter();
  const { data: days = [], isLoading } = useItinerary(tripId);

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('pickDayTitle')}
      description={t('pickDayTitle')}
    >
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('loadingDays')}</p>
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-4">
          <EmptyState icon={CalendarDays} title={t('noDays')} description={t('noDaysHint')} />
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              router.push(ROUTES.TRIP_ITINERARY(tripId));
            }}
          >
            {t('goToItinerary')}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {days.map((day) => (
            <li key={day.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPickDay(day.id)}
                className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
              >
                <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                  Day {day.day_number}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{day.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveFormSheet>
  );
}
