'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Wallet } from 'lucide-react';
import type { Budget } from '@/types';
import type { SetBudgetInput } from '@/lib/validation';
import { CATEGORIES } from '@/constants/categories';
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

interface BudgetDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SetBudgetInput) => Promise<void>;
  budget: Budget | null;
}

/** 數字輸入 → 正數則回傳，其餘（空白 / 0 / 負 / NaN）回傳 null。 */
function parseAmount(value: string): number | null {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function BudgetDialog({ open, onClose, onSubmit, budget }: BudgetDialogProps) {
  const t = useTranslations('budget');
  const tCategory = useTranslations('category');
  const tCommon = useTranslations('common');

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [total, setTotal] = useState('');
  const [categoryAmounts, setCategoryAmounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時用 budget 帶入表單，為刻意的同步
    setTotal(budget?.total != null ? String(budget.total) : '');
    const map: Record<string, string> = {};
    for (const c of budget?.categories ?? []) {
      map[c.category] = String(c.amount);
    }
    setCategoryAmounts(map);
    setError('');
  }, [open, budget]);

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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {t('dialog.title')}
          </DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="budget-total">{t('dialog.totalLabel')}</Label>
            <Input
              id="budget-total"
              type="number"
              min="0"
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder={t('dialog.totalPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('dialog.categoriesLabel')}</Label>
            <div className="space-y-2">
              {CATEGORIES.map((c) => (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="flex w-28 shrink-0 items-center gap-1.5 text-sm">
                    <span aria-hidden>{c.icon}</span>
                    {tCategory(c.code)}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={categoryAmounts[c.code] ?? ''}
                    onChange={(e) =>
                      setCategoryAmounts((prev) => ({ ...prev, [c.code]: e.target.value }))
                    }
                    placeholder="—"
                    className="h-9"
                  />
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('dialog.hint')}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('dialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
