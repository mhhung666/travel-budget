'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Globe2 } from 'lucide-react';

import { getLocalizedCountryName } from '@/constants/countries';
import type { VisitedCountryItem } from '@/types';
import { EmptyState } from '@/components/common';
import { StatTiles } from './RecordFormFields';

/** ISO 3166-1 alpha-2 → 國旗 emoji（regional indicator 組合，任何國碼皆可）。 */
function flagEmoji(code: string): string {
  return code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/**
 * 國家收藏 tab：由旅程資料（出發/目的地＋行程日地點）自動推導，零手動輸入。
 * 口徑與旅行地圖/年度回顧一致。
 */
export function CountriesTab({ countries }: { countries: VisitedCountryItem[] }) {
  const t = useTranslations('collections');
  const locale = useLocale();

  if (countries.length === 0) {
    return (
      <EmptyState
        icon={Globe2}
        title={t('countries.empty')}
        description={t('countries.emptyDesc')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatTiles tiles={[{ label: t('countries.stats.countries'), value: countries.length }]} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {countries.map((c) => (
          <div key={c.code} className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <span className="text-2xl" aria-hidden>
              {flagEmoji(c.code)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {getLocalizedCountryName(c.code, locale, c.code)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('countries.tripsCount', { count: c.trip_count })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">{t('countries.autoNote')}</p>
    </div>
  );
}
