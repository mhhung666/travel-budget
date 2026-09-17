'use client';

import { ScanLine, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type AiMode = 'text' | 'receipt';

const modes = [
  { value: 'text', Icon: Sparkles },
  { value: 'receipt', Icon: ScanLine },
] as const;

/** The form itself is manual entry; AI tools stay two small secondary entries until chosen.
 * Pressing the open entry again collapses it. */
export function ExpenseAiModeButtons({
  mode,
  onSelect,
}: {
  mode: AiMode | null;
  onSelect: (mode: AiMode | null) => void;
}) {
  const t = useTranslations('expense.form.ai');
  return (
    <div role="group" aria-label={t('title')} className="flex flex-wrap gap-2">
      {modes.map(({ value, Icon }) => {
        const active = mode === value;
        return (
          <Button
            key={value}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active}
            className={cn(
              'text-muted-foreground',
              active && 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/15'
            )}
            onClick={() => onSelect(active ? null : value)}
          >
            <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t(`modes.${value}`)}
          </Button>
        );
      })}
    </div>
  );
}
