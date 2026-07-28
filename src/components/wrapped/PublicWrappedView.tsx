'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import type { YearInReviewData } from '@/types';
import { WrappedCard } from './WrappedCard';

/** 公開 API 回傳的去識別化年度回顧（僅地理 + 年份，無金額）。 */
interface PublicPayload {
  year: number;
  tripCount: number;
  countryCount: number;
  cityCount: number;
  availableYears: number[];
}

/** 把去識別化 payload 補成 WrappedCard 需要的形狀（金額/旅伴等補 0，includeMoney=false 永不讀取）。 */
function toReview(p: PublicPayload): YearInReviewData {
  return {
    year: p.year,
    tripCount: p.tripCount,
    countryCount: p.countryCount,
    cityCount: p.cityCount,
    distanceKm: 0,
    longestTripDays: 0,
    companionCount: 0,
    totalSpend: 0,
    expenseCount: 0,
    topCategory: null,
    categoryBreakdown: [],
    monthlySpend: new Array<number>(12).fill(0),
    busiestMonth: null,
  };
}

interface PublicWrappedViewProps {
  code: string;
  year: number;
}

export default function PublicWrappedView({ code, year: initialYear }: PublicWrappedViewProps) {
  const t = useTranslations('wrapped');
  const [year, setYear] = useState(initialYear);
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ROUTES.API.PUBLIC_WRAPPED(code, year));
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notFound');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data: PublicPayload = await res.json();
        if (cancelled) return;
        setPayload(data);
        // 年份清單只在首次（或仍為空時）採用，避免切換年份時清單跳動。
        setAvailableYears((prev) => (prev.length > 0 ? prev : data.availableYears));
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, year]);

  if (status === 'loading' && !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'notFound' || status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground">
        <Sparkles className="h-10 w-10" />
        <p>{t('public.notFound')}</p>
      </div>
    );
  }

  const review = payload ? toReview(payload) : null;
  const isEmpty = review !== null && review.tripCount === 0 && review.cityCount === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{t('public.title')}</h1>
          <div className="flex items-center gap-2">
            {payload && (
              <span className="text-sm text-muted-foreground">
                {t('public.subtitle', { year: payload.year, trips: payload.tripCount })}
              </span>
            )}
            {/* 公開頁無主導覽列，語言切換放這裡 */}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        {/* 年份切換 */}
        {availableYears.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            {availableYears.map((y) => (
              <Button
                key={y}
                variant={year === y ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-3"
                onClick={() => setYear(y)}
              >
                {y}
              </Button>
            ))}
          </div>
        )}

        {isEmpty ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10" />
            <p>{t('public.empty')}</p>
          </div>
        ) : (
          review && (
            <div className="space-y-5">
              <WrappedCard review={review} includeMoney={false} includeDistance={false} />
              <div className="flex justify-center">
                <Button asChild variant="outline" className="gap-2">
                  <Link href={ROUTES.WRAPPED}>
                    <Sparkles className="h-4 w-4" />
                    {t('public.cta')}
                  </Link>
                </Button>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}
