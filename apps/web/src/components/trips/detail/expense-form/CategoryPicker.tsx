'use client';

import { useTranslations } from 'next-intl';
import { CATEGORIES } from '@/constants/categories';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface CategoryPickerProps {
  value: string;
  onChange: (categoryCode: string) => void;
}

/** 消費類別 icon 網格（點選即選取）。 */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const t = useTranslations();
  const tExpense = useTranslations('expense');

  return (
    <div>
      <Label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {tExpense('form.category')}
      </Label>
      <div className="grid grid-cols-4 gap-2">
        {CATEGORIES.map((cat) => {
          const isSelected = value === cat.code;
          return (
            <button
              type="button"
              key={cat.code}
              onClick={() => onChange(cat.code)}
              className={cn(
                'flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-lg border p-2 transition-all',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="mb-1 text-2xl">{cat.icon}</span>
              <span
                className={cn('w-full truncate text-center text-xs', isSelected && 'font-semibold')}
              >
                {t(cat.nameKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
