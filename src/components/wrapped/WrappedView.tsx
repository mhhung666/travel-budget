'use client';

import { useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCurrentUser, useYearInReview } from '@/hooks/queries';
import { logger } from '@/lib/logger';
import { WrappedCard } from './WrappedCard';
import WrappedShareDialog from './WrappedShareDialog';

/** app locale → Intl BCP-47（金額/數字在地化）。 */
function bcp47(locale: string): string {
  return locale === 'zh'
    ? 'zh-TW'
    : locale === 'zh-CN'
      ? 'zh-CN'
      : locale === 'jp'
        ? 'ja-JP'
        : 'en-US';
}

/** 每月花費長條（highlight 最高月）；僅在有花費時呈現。 */
function MonthlyBars({
  monthly,
  busiest,
  title,
}: {
  monthly: number[];
  busiest: number | null;
  title: string;
}) {
  const max = Math.max(1, ...monthly);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="flex h-28 items-end justify-between gap-1">
        {monthly.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t transition-colors ${i === busiest ? 'bg-primary' : 'bg-primary/30'}`}
              style={{ height: `${Math.max(2, (v / max) * 88)}px` }}
            />
            <span className="text-[10px] text-muted-foreground">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WrappedView() {
  const t = useTranslations('wrapped');
  const locale = useLocale();
  const { toast } = useToast();

  const { data: user } = useCurrentUser();
  const [year, setYear] = useState<number | null>(null);
  const { data, isLoading } = useYearInReview(year, Boolean(user));

  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const formatMoney = useMemo(() => {
    const fmt = new Intl.NumberFormat(bcp47(locale), {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    return (n: number) => fmt.format(n);
  }, [locale]);

  const review = data?.review;
  const availableYears = data?.availableYears ?? [];
  const activeYear = review?.year ?? year ?? null;

  const handleDownload = async () => {
    if (!cardRef.current || !review) return;
    setDownloading(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const fileName = `travel-wrapped-${review.year}.png`;
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });
      // 支援檔案分享的裝置（多為手機）走原生分享面板，否則退回下載。
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: t('shareImageTitle') });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.click();
      }
    } catch (err) {
      // 使用者在原生分享面板取消不算錯誤。
      if ((err as Error)?.name !== 'AbortError') {
        logger.error('Wrapped image export failed', err);
        toast({ variant: 'destructive', description: t('downloadError') });
      }
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 完全沒有可回顧的年份（無任何旅行/支出）。
  if (availableYears.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 pt-16 text-center text-muted-foreground">
        <Sparkles className="h-10 w-10" />
        <p>{t('empty')}</p>
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-2xl px-4 pt-24 pb-12 sm:pt-28">
      {/* 年份切換 */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {availableYears.map((y) => (
          <Button
            key={y}
            variant={activeYear === y ? 'secondary' : 'ghost'}
            size="sm"
            className="h-8 px-3"
            onClick={() => setYear(y)}
          >
            {y}
          </Button>
        ))}
      </div>

      {review && (
        <div className="space-y-4">
          <WrappedCard
            ref={cardRef}
            review={review}
            includeMoney
            ownerName={user?.display_name || user?.username}
            formatMoney={formatMoney}
          />

          {/* 分享 / 下載 */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={handleDownload} disabled={downloading} className="gap-2">
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? t('downloading') : t('download')}
            </Button>
            {activeYear !== null && <WrappedShareDialog year={activeYear} />}
          </div>

          {/* 每月花費（有花費才顯示） */}
          {review.totalSpend > 0 && (
            <MonthlyBars
              monthly={review.monthlySpend}
              busiest={review.busiestMonth}
              title={t('monthlyTitle')}
            />
          )}
        </div>
      )}
    </main>
  );
}
