'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
import { intlLocale } from '@/lib/relativeTime';
import { cn } from '@/lib/utils';

// 行程日頂端離日期列下緣在這個距離內，就算「目前這一天」。留得寬一點：
// 捲動後頁首進 compact mode 會變矮，日期列與卡片之間可能多出空隙。
const ACTIVE_THRESHOLD_PX = 96;

export const itineraryDayAnchorId = (dayNumber: number) => `itinerary-day-${dayNumber}`;

interface ItineraryDayNavProps {
  days: ItineraryDay[];
  /** 每個行程日的推算日期（YYYY-MM-DD），依 day.id 查。 */
  datesByDayId: Map<string, string | null | undefined>;
  /** 旅途中的今天是第幾天；非旅途中為 null。 */
  todayDayNumber: number | null;
}

/**
 * 行程頁的日期快速切換：黏在行程空間頁首下方（高度由 TripSpaceShell 的
 * `--trip-space-header-height` 提供），捲動時標示目前所在的一天。
 */
export default function ItineraryDayNav({
  days,
  datesByDayId,
  todayDayNumber,
}: ItineraryDayNavProps) {
  const t = useTranslations('itinerary');
  const locale = useLocale();
  const navRef = useRef<HTMLElement>(null);
  const shortDate = new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const [activeDay, setActiveDay] = useState<number | null>(days[0]?.day_number ?? null);

  // Scroll spy：最後一個頂端已捲到日期列下緣的行程日＝目前所在。
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const navBottom = navRef.current?.getBoundingClientRect().bottom ?? 0;
      let current = days[0]?.day_number ?? null;
      for (const day of days) {
        const el = document.getElementById(itineraryDayAnchorId(day.day_number));
        if (el && el.getBoundingClientRect().top - navBottom <= ACTIVE_THRESHOLD_PX)
          current = day.day_number;
      }
      // 捲到底時最後幾天的頂端到不了日期列，直接視為最後一天。
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && days.length > 0 && window.scrollY > 0) {
        current = days[days.length - 1].day_number;
      }
      setActiveDay(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [days]);

  // 目前那一顆若在橫向捲動區外，把它捲進來（只動日期列本身，不動頁面）。
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-day="${activeDay}"]`);
    if (!nav || !chip) return;
    const left = chip.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft || left + chip.offsetWidth > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: Math.max(0, left - 16) });
    }
  }, [activeDay]);

  const jumpTo = (dayNumber: number) => {
    const el = document.getElementById(itineraryDayAnchorId(dayNumber));
    const nav = navRef.current;
    if (!el || !nav) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // 以日期列黏住時的下緣為準（sticky top + 自身高度），卡片標題不會被蓋住。
    const stickyTop = parseFloat(getComputedStyle(nav).top) || 0;
    const offset = stickyTop + nav.offsetHeight + 12;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - offset,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
    setActiveDay(dayNumber);
  };

  return (
    <nav
      ref={navRef}
      aria-label={t('dayNav')}
      className="sticky top-[var(--trip-space-header-height,0px)] z-30 -mx-4 mb-4 flex gap-2 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur [scrollbar-width:none] supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 md:top-[calc(4rem+var(--trip-space-header-height,0px))] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((day) => {
        const active = day.day_number === activeDay;
        const isToday = day.day_number === todayDayNumber;
        const date = datesByDayId.get(day.id);
        return (
          <button
            key={day.id}
            type="button"
            data-day={day.day_number}
            aria-current={active ? 'location' : undefined}
            onClick={() => jumpTo(day.day_number)}
            className={cn(
              'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium tabular-nums transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              isToday && !active && 'border-primary text-primary'
            )}
          >
            <span>Day {day.day_number}</span>
            {isToday ? (
              <span className="text-xs">{t('today')}</span>
            ) : (
              date && (
                <span className="text-xs opacity-75">
                  {shortDate.format(new Date(`${date}T00:00:00Z`))}
                </span>
              )
            )}
          </button>
        );
      })}
    </nav>
  );
}
