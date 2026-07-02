'use client';

import { useTranslations } from 'next-intl';
import { Trophy, Users } from 'lucide-react';
import type { MemberSpend } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MemberSpendRankingProps {
  memberSpends: MemberSpend[];
  formatCurrency: (amount: number) => string;
}

/**
 * 全團付款排行（誰花最多）。主數字為「付款」總額（出錢），條長以最高付款者為滿格；
 * 副標顯示「分攤」總額（被分到多少）。
 */
export default function MemberSpendRanking({
  memberSpends,
  formatCurrency,
}: MemberSpendRankingProps) {
  const t = useTranslations('stats');
  const maxPaid = Math.max(1, ...memberSpends.map((m) => m.paid));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          {t('memberSpending')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {memberSpends.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">{t('noData')}</p>
        ) : (
          <ul className="space-y-3">
            {memberSpends.map((m, i) => (
              <li key={m.userId}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    {i === 0 && m.paid > 0 && (
                      <Trophy className="h-3.5 w-3.5 shrink-0 text-warning" />
                    )}
                    <span className="truncate">{m.name}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold">{formatCurrency(m.paid)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((m.paid / maxPaid) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('shareTotal')} {formatCurrency(m.share)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
