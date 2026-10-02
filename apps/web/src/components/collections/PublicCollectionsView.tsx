'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Award, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { ALLIANCE_COUNT } from '@/constants/alliances';
import { computeBadges, type BadgeCounts } from '@/lib/badges';
import { Button } from '@/components/ui/button';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import { StatTiles } from './RecordFormFields';
import { BadgeWall } from './BadgeWall';

/**
 * 成就徽章公開分享卡（去識別化、唯讀，不需登入）。公開 API 只回彙總數字
 * （BadgeCounts），徽章在此以同一份 [lib/badges.ts] 推導——頁面上沒有任何
 * 逐筆紀錄可洩漏（無日期、航班號、航空/品牌明細）。
 */
export function PublicCollectionsView({ code }: { code: string }) {
  const t = useTranslations('collections');
  const [counts, setCounts] = useState<BadgeCounts | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notFound' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ROUTES.API.PUBLIC_COLLECTIONS(code));
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notFound');
          return;
        }
        if (!res.ok) {
          setStatus('error');
          return;
        }
        const data: BadgeCounts = await res.json();
        if (cancelled) return;
        setCounts(data);
        setStatus('ok');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === 'notFound' || status === 'error' || !counts) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center text-muted-foreground">
        <Award className="h-10 w-10" />
        <p>{t('public.notFound')}</p>
      </div>
    );
  }

  const badges = computeBadges(counts);
  const earned = badges.filter((b) => b.achieved).length;
  const isEmpty = counts.flights === 0 && counts.stays === 0 && counts.countries === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{t('public.title')}</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('public.subtitle', { earned, total: badges.length })}
            </span>
            {/* 公開頁無主導覽列，語言切換放這裡 */}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-6">
        {isEmpty ? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Award className="h-10 w-10" />
            <p>{t('public.empty')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <StatTiles
              tiles={[
                { label: t('flights.stats.flights'), value: counts.flights },
                {
                  label: t('flights.stats.alliances'),
                  value: `${counts.alliances}/${ALLIANCE_COUNT}`,
                },
                { label: t('badges.stats.countries'), value: counts.countries },
              ]}
            />
            <BadgeWall badges={badges} />
            <div className="flex justify-center">
              <Button asChild variant="outline" className="gap-2">
                <Link href={ROUTES.COLLECTIONS}>
                  <Award className="h-4 w-4" />
                  {t('public.cta')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
