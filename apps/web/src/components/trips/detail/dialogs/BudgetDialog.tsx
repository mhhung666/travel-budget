'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronDown, Loader2, LockKeyhole, RotateCcw, Wallet } from 'lucide-react';
import type { Budget } from '@/types';
import type { SetBudgetInput } from '@/lib/validation';
import { CATEGORIES } from '@/constants/categories';
import { formatCurrency } from '@/constants/currencies';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface BudgetDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SetBudgetInput) => Promise<void>;
  budget: Budget | null;
  legacyBudget?: Budget | null;
}

/** 數字輸入 → 正數則回傳，其餘（空白 / 0 / 負 / NaN）回傳 null。 */
function parseAmount(value: string): number | null {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function BudgetDialog({
  open,
  onClose,
  onSubmit,
  budget,
  legacyBudget = null,
}: BudgetDialogProps) {
  const t = useTranslations('budget');
  const tCategory = useTranslations('category');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [total, setTotal] = useState('');
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>({});
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時用 budget 帶入表單，為刻意的同步
    setTotal(budget?.total != null ? String(budget.total) : '');
    const map: Record<string, string> = {};
    for (const c of budget?.categories ?? []) {
      map[c.category] = String(c.amount);
    }
    setCategoryAmounts(map);
    setCategoriesOpen((budget?.categories.length ?? 0) > 0);
    setError('');
  }, [open, budget]);

  const activeCategoryCount = useMemo(
    () =>
      CATEGORIES.filter((category) => parseAmount(categoryAmounts[category.code] ?? '') !== null)
        .length,
    [categoryAmounts]
  );
  const allocatedAmount = useMemo(
    () =>
      CATEGORIES.reduce(
        (sum, category) => sum + (parseAmount(categoryAmounts[category.code] ?? '') ?? 0),
        0
      ),
    [categoryAmounts]
  );
  const totalAmount = parseAmount(total);
  const allocationPercent =
    totalAmount && allocatedAmount > 0 ? Math.min((allocatedAmount / totalAmount) * 100, 100) : 0;
  const overAllocated = totalAmount !== null && allocatedAmount > totalAmount;
  const hasDraftValues = totalAmount !== null || activeCategoryCount > 0;

  const clearBudget = () => {
    setTotal('');
    setCategoryAmounts({});
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    const categories = CATEGORIES.map((c) => ({
      category: c.code,
      amount: parseAmount(categoryAmounts[c.code] ?? ''),
    }))
      .filter((c): c is { category: string; amount: number } => c.amount !== null)
      .map((c) => ({ category: c.category, amount: c.amount }));

    try {
      await onSubmit({ total: parseAmount(total), categories });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSaving && onClose()}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[540px]">
        <DialogHeader className="border-b bg-muted/30 px-5 py-5 pr-14 text-left sm:px-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{t('dialog.title')}</DialogTitle>
              <DialogDescription>{t('dialog.description')}</DialogDescription>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
            <span>{t('dialog.private')}</span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {legacyBudget && !budget && (
              <Alert className="bg-muted/30">
                <AlertTitle>{t('dialog.legacyTitle')}</AlertTitle>
                <AlertDescription>
                  {t('dialog.legacyDescription', {
                    amount:
                      legacyBudget.total != null
                        ? formatCurrency(legacyBudget.total, 'TWD', locale)
                        : t('dialog.legacyCategoriesOnly'),
                  })}
                </AlertDescription>
              </Alert>
            )}

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Label htmlFor="budget-total" className="text-sm font-semibold">
                  {t('dialog.totalLabel')}
                </Label>
                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  TWD
                </span>
              </div>
              <div className="relative">
                <span
                  className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base font-medium text-muted-foreground"
                  aria-hidden
                >
                  NT$
                </span>
                <Input
                  id="budget-total"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder={t('dialog.totalPlaceholder')}
                  className="h-14 rounded-xl pl-14 text-2xl font-semibold tabular-nums"
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t('dialog.totalHelp')}
              </p>
            </section>

            <Collapsible
              open={categoriesOpen}
              onOpenChange={setCategoriesOpen}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">
                    🧩
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{t('dialog.categoriesTitle')}</span>
                      {activeCategoryCount > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {t('dialog.configured', { count: activeCategoryCount })}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {activeCategoryCount > 0
                        ? t('dialog.allocated', {
                            amount: formatCurrency(allocatedAmount, 'TWD', locale),
                          })
                        : t('dialog.categoriesDescription')}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      categoriesOpen && 'rotate-180'
                    )}
                    aria-hidden
                  />
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="border-t">
                {(totalAmount !== null || allocatedAmount > 0) && (
                  <div className="border-b bg-muted/20 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{t('dialog.allocatedLabel')}</span>
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          overAllocated && 'text-destructive'
                        )}
                      >
                        {formatCurrency(allocatedAmount, 'TWD', locale)}
                        {totalAmount !== null && ` / ${formatCurrency(totalAmount, 'TWD', locale)}`}
                      </span>
                    </div>
                    {totalAmount !== null && (
                      <>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-[width]',
                              overAllocated ? 'bg-destructive' : 'bg-primary'
                            )}
                            style={{ width: `${allocationPercent}%` }}
                          />
                        </div>
                        <p
                          className={cn(
                            'mt-1.5 text-xs',
                            overAllocated ? 'text-destructive' : 'text-muted-foreground'
                          )}
                        >
                          {overAllocated
                            ? t('dialog.overAllocated', {
                                amount: formatCurrency(
                                  allocatedAmount - totalAmount,
                                  'TWD',
                                  locale
                                ),
                              })
                            : t('dialog.unallocated', {
                                amount: formatCurrency(
                                  totalAmount - allocatedAmount,
                                  'TWD',
                                  locale
                                ),
                              })}
                        </p>
                      </>
                    )}
                  </div>
                )}

                <div className="space-y-2 p-3">
                  {CATEGORIES.map((category) => (
                    <div
                      key={category.code}
                      className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors focus-within:bg-muted/50"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-base"
                        aria-hidden
                      >
                        {category.icon}
                      </span>
                      <Label
                        htmlFor={`budget-category-${category.code}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                      >
                        {tCategory(category.code)}
                      </Label>
                      <div className="relative w-32 shrink-0">
                        <span
                          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground"
                          aria-hidden
                        >
                          NT$
                        </span>
                        <Input
                          id={`budget-category-${category.code}`}
                          type="number"
                          min="0"
                          inputMode="numeric"
                          value={categoryAmounts[category.code] ?? ''}
                          onChange={(e) =>
                            setCategoryAmounts((prev) => ({
                              ...prev,
                              [category.code]: e.target.value,
                            }))
                          }
                          placeholder="—"
                          className="h-10 rounded-lg pl-10 text-right tabular-nums"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex items-start justify-between gap-4">
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t('dialog.hint')}
              </p>
              {(budget || hasDraftValues) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearBudget}
                  className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t('dialog.clear')}
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2 border-t bg-background px-4 py-4 sm:flex sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="h-11"
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving} className="h-11">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
