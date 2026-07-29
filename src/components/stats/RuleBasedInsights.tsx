'use client';

import { useEffect } from 'react';
import { ArrowRight, Calculator, Lightbulb } from 'lucide-react';
import type { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  STATS_INSIGHT_RULES,
  STATS_INSIGHT_RULE_VERSION,
  type StatsInsight,
} from '@/lib/statsInsights';
import { trackProductEvent } from '@/lib/productEvents';
import type { StatsData } from '@/types';
import { cn } from '@/lib/utils';

type Translator = ReturnType<typeof useTranslations<'stats'>>;

interface RuleBasedInsightsProps {
  stats: StatsData;
  t: Translator;
  categoryName: (key: string) => string;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  activeFilters: {
    tripId?: string;
    category?: string;
    tag?: string;
    periodStart?: string;
    periodEnd?: string;
    expenseId?: string;
  };
  onSelect: (insight: StatsInsight) => void;
}

const EMPTY_INSIGHTS: StatsInsight[] = [];

function percentage(value = 0) {
  return Math.round(value * 100);
}

function insightText(
  insight: StatsInsight,
  t: Translator,
  categoryName: (key: string) => string,
  formatDate: (date: string) => string
) {
  const values = {
    trip: insight.tripName,
    percentage: percentage(insight.percentage),
    category: insight.category ? categoryName(insight.category) : '',
    tag: insight.tag ?? '',
    date: insight.date ? formatDate(insight.date) : '',
    expense: insight.expenseDescription || t('noDescription'),
    count: insight.categoryCount ?? 0,
  };

  return t(`advancedInsight.${insight.type}.title`, values);
}

function calculationText(
  insight: StatsInsight,
  t: Translator,
  formatCurrency: (amount: number) => string
) {
  if (insight.type === 'balanced_category_distribution') {
    return t('advancedInsight.balancedCalculation', {
      percentage: percentage(insight.percentage),
      threshold: percentage(
        STATS_INSIGHT_RULES.balancedCategoryDistribution.maximumTopCategoryShare
      ),
    });
  }

  const threshold =
    insight.type === 'single_expense_concentration'
      ? STATS_INSIGHT_RULES.singleExpenseConcentration.minimumShare
      : insight.type === 'spending_day_concentration'
        ? STATS_INSIGHT_RULES.spendingDayConcentration.minimumShare
        : insight.type === 'trip_category_concentration'
          ? STATS_INSIGHT_RULES.categoryConcentration.minimumShare
          : STATS_INSIGHT_RULES.tagConcentration.minimumShare;

  return t('advancedInsight.concentrationCalculation', {
    amount: formatCurrency(insight.amount),
    total: formatCurrency(insight.totalAmount),
    percentage: percentage(insight.percentage),
    threshold: percentage(threshold),
  });
}

function isSelected(insight: StatsInsight, filters: RuleBasedInsightsProps['activeFilters']) {
  const expected = {
    tripId: insight.filter.tripId,
    category: insight.filter.category,
    tag: insight.filter.tag,
    periodStart: insight.filter.startDate,
    periodEnd: insight.filter.endDate,
    expenseId: insight.filter.expenseId,
  };

  return (
    Object.entries(expected).every(
      ([key, value]) => filters[key as keyof typeof filters] === value
    ) &&
    Object.entries(filters).every(
      ([key, value]) => value === undefined || expected[key as keyof typeof expected] === value
    )
  );
}

export default function RuleBasedInsights({
  stats,
  t,
  categoryName,
  formatCurrency,
  formatDate,
  activeFilters,
  onSelect,
}: RuleBasedInsightsProps) {
  // Persisted v3 query data predates server-generated insights. Keep this
  // boundary tolerant even after the cache buster removes those old entries.
  const insights = stats.insights ?? EMPTY_INSIGHTS;
  const ruleVersion = stats.insightRuleVersion ?? STATS_INSIGHT_RULE_VERSION;
  useEffect(() => {
    const result =
      insights.length === 0
        ? 'none'
        : insights.length === 1
          ? 'one'
          : insights.length === 2
            ? 'two'
            : 'three_plus';
    trackProductEvent('stats_insight_result', {
      ruleVersion,
      result,
    });
    insights.forEach((insight) => {
      trackProductEvent('stats_insight_impression', {
        ruleVersion,
        insightType: insight.type,
      });
    });
  }, [insights, ruleVersion]);

  if (!insights.length) return null;

  return (
    <section className="mb-6" aria-labelledby="advanced-insights-heading">
      <div className="mb-3">
        <h2 id="advanced-insights-heading" className="font-semibold">
          {t('advancedInsight.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('advancedInsight.hint')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {insights.map((insight) => {
          const selected = isSelected(insight, activeFilters);
          const title = insightText(insight, t, categoryName, formatDate);
          return (
            <Card
              key={insight.id}
              className={cn('h-full border-muted', selected && 'border-primary bg-primary/5')}
            >
              <CardContent className="flex h-full flex-col p-4">
                <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Lightbulb size={17} className="text-primary" aria-hidden />
                  {t(`advancedInsight.${insight.type}.label`)}
                </div>
                <p className="font-semibold">{title}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatCurrency(insight.amount)} ·{' '}
                  {t('advancedInsight.sampleSize', { count: insight.sampleSize })}
                </p>
                <details className="group mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-primary">
                    {t('advancedInsight.howCalculated')}
                  </summary>
                  <div className="mb-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                    <div className="flex gap-2">
                      <Calculator size={15} className="mt-0.5 shrink-0" aria-hidden />
                      <span>{calculationText(insight, t, formatCurrency)}</span>
                    </div>
                    {insight.date && (
                      <p className="mt-2">
                        {t('advancedInsight.calculationDate', {
                          date: formatDate(insight.date),
                        })}
                      </p>
                    )}
                    {insight.type === 'trip_tag_concentration' && (
                      <p className="mt-2">{t('advancedInsight.tagOverlapNote')}</p>
                    )}
                  </div>
                </details>
                <Button
                  type="button"
                  variant={selected ? 'secondary' : 'outline'}
                  className="mt-auto w-full justify-between"
                  aria-pressed={selected}
                  aria-label={t('advancedInsight.viewDetailsLabel', { insight: title })}
                  onClick={() => onSelect(insight)}
                >
                  {selected
                    ? t('advancedInsight.viewingDetails')
                    : t('advancedInsight.viewDetails')}
                  <ArrowRight size={16} aria-hidden />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
