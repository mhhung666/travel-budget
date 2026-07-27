'use client';

import { Check, Circle, Copy, ReceiptText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FirstStepsCardProps {
  hasExpense: boolean;
  hasInvited: boolean;
  onAddExpense: () => void;
  onCopyInvite: () => void;
  onDismiss: () => void;
}

/**
 * 新旅行的非強制式 onboarding。只保留兩個能形成產品價值的第一步，
 * 資料完成後自動收起，不佔用熟悉產品的使用者空間。
 */
export default function FirstStepsCard({
  hasExpense,
  hasInvited,
  onAddExpense,
  onCopyInvite,
  onDismiss,
}: FirstStepsCardProps) {
  const t = useTranslations('trip.firstSteps');

  if (hasExpense && hasInvited) return null;

  const steps = [
    {
      key: 'expense',
      done: hasExpense,
      label: t('expense'),
      action: t('addExpense'),
      icon: ReceiptText,
      onClick: onAddExpense,
    },
    {
      key: 'invite',
      done: hasInvited,
      label: t('invite'),
      action: t('copyInvite'),
      icon: Copy,
      onClick: onCopyInvite,
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <section
      className="mb-5 rounded-xl border bg-primary/5 p-4"
      aria-labelledby="first-steps-title"
    >
      <div className="mb-3">
        <div className="flex items-start gap-3">
          <h2 id="first-steps-title" className="font-semibold">
            {t('title')}
          </h2>
          <span className="ml-auto pt-1 text-xs tabular-nums text-muted-foreground">
            {t('progress', { completed, total: steps.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2"
            aria-label={t('dismiss')}
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <div className="space-y-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.key}
              className="flex min-h-12 items-center gap-3 rounded-lg bg-background px-3 py-2"
            >
              {step.done ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
              ) : (
                <Circle className="h-6 w-6 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm font-medium',
                  step.done && 'text-muted-foreground line-through'
                )}
              >
                {step.label}
              </span>
              {!step.done && (
                <Button type="button" variant="outline" size="sm" onClick={step.onClick}>
                  <Icon className="h-4 w-4" />
                  {step.action}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
