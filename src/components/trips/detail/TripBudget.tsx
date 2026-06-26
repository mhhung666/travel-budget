'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Wallet, Pencil } from 'lucide-react';
import type { Budget, Expense } from '@/types';
import { computeBudgetProgress } from '@/lib/budget';
import { getCategoryIcon } from '@/constants/categories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TripBudgetProps {
  budget: Budget | null;
  expenses: Expense[];
  isCurrentUserAdmin: boolean;
  onEdit: () => void;
}

/** 金額以基準幣（TWD）顯示，與結算 / 統計一致用 `$` 前綴。 */
function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** 單條進度條：未超支綠色、接近（≥80%）琥珀色、超支紅色。 */
function BudgetBar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const over = spent > budget;
  const near = !over && pct >= 80;
  const color = over ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all', color)}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export default function TripBudget({
  budget,
  expenses,
  isCurrentUserAdmin,
  onEdit,
}: TripBudgetProps) {
  const t = useTranslations('budget');
  const tCategory = useTranslations('category');

  const progress = useMemo(() => computeBudgetProgress(budget, expenses), [budget, expenses]);

  // 只列出有設預算的分類（有花費但沒設預算者計入總額，不單獨列出）。
  const categoryRows = progress.categories.filter((c) => c.budget !== null);

  // 未設定任何預算：admin 看到引導 CTA，其餘成員不顯示此卡。
  if (!progress.hasBudget) {
    if (!isCurrentUserAdmin) return null;
    return (
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('empty.description')}</p>
          <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
            <Wallet className="mr-2 h-4 w-4" />
            {t('empty.cta')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totalOver = progress.total !== null && progress.totalSpent > progress.total;
  const remaining = progress.total !== null ? progress.total - progress.totalSpent : null;

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            {t('title')}
          </CardTitle>
          {isCurrentUserAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground"
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs">{t('edit')}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 總預算（若有設總額） */}
        {progress.total !== null ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-muted-foreground">{t('total')}</span>
              <span className="text-sm font-semibold">
                {fmt(progress.totalSpent)}
                <span className="font-normal text-muted-foreground"> / {fmt(progress.total)}</span>
              </span>
            </div>
            <BudgetBar spent={progress.totalSpent} budget={progress.total} />
            <div className="flex justify-end">
              <span
                className={cn(
                  'text-xs font-medium',
                  totalOver ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                )}
              >
                {totalOver
                  ? `${t('overBudget')} ${fmt(Math.abs(remaining as number))}`
                  : `${t('remaining')} ${fmt(remaining as number)}`}
              </span>
            </div>
          </div>
        ) : (
          // 只設了分類預算時，總額僅作資訊呈現（無進度條）
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('totalSpent')}</span>
            <span className="text-sm font-semibold">{fmt(progress.totalSpent)}</span>
          </div>
        )}

        {/* 分類預算 */}
        {categoryRows.length > 0 && (
          <div className="space-y-3 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">{t('byCategory')}</span>
            {categoryRows.map((c) => {
              const over = c.spent > (c.budget as number);
              return (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden>{getCategoryIcon(c.category)}</span>
                      {tCategory(c.category)}
                    </span>
                    <span
                      className={cn(
                        'tabular-nums',
                        over ? 'font-semibold text-red-600 dark:text-red-400' : 'text-foreground'
                      )}
                    >
                      {fmt(c.spent)}
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        / {fmt(c.budget as number)}
                      </span>
                    </span>
                  </div>
                  <BudgetBar spent={c.spent} budget={c.budget as number} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
