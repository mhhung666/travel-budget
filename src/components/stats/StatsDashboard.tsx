'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CircleDollarSign,
  Layers3,
  Loader2,
  Plane,
  RefreshCcw,
  ReceiptText,
  Tag,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import DateRangeFilter from './DateRangeFilter';
import ExpenseHistogram from './ExpenseHistogram';
import RuleBasedInsights from './RuleBasedInsights';
import type { CategoryStat, ExpenseDetail, PersonalTripStat, StatsData, TagStat } from '@/types';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState } from '@/components/common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import type {
  StatsDashboardViewState,
  StatsDetailFilters,
  StatsDimension,
} from '@/lib/statsViewState';
import type { StatsInsight } from '@/lib/statsInsights';
import { trackProductEvent } from '@/lib/productEvents';

type Dimension = StatsDimension;
type Sort = 'amount' | 'count' | 'name';
type ExpenseSort = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';
export type { StatsDashboardViewState, StatsDetailFilters } from '@/lib/statsViewState';
type DimensionItem = {
  id: string;
  name: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
  href?: string;
};
type InsightItem = {
  key: string;
  label: string;
  dimension: Dimension;
  item: DimensionItem;
  icon: typeof Plane;
};

interface StatsDashboardProps {
  stats: StatsData | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onYearSelect: (year: number) => void;
  onClearDates: () => void;
  viewState: StatsDashboardViewState;
  onViewStateChange: (state: StatsDashboardViewState) => void;
}

function dimensionItems(
  dimension: Dimension,
  stats: Pick<StatsData, 'categoryStats' | 'tripStats' | 'tagStats'>,
  categoryName: (key: string) => string
): DimensionItem[] {
  if (dimension === 'trip') {
    return stats.tripStats.map((item: PersonalTripStat) => ({
      id: item.tripId,
      name: item.tripName,
      total: item.total,
      count: item.count,
      details: item.details,
      href: ROUTES.TRIP_EXPENSES(item.tripId),
    }));
  }
  if (dimension === 'tag') {
    return stats.tagStats.map((item: TagStat) => ({
      id: item.tag,
      name: item.tag,
      total: item.total,
      count: item.count,
      details: item.details,
    }));
  }
  return stats.categoryStats.map((item: CategoryStat) => ({
    id: item.category,
    name: categoryName(item.category),
    total: item.total,
    count: item.count,
    details: item.details,
  }));
}

export default function StatsDashboard({
  stats,
  loading,
  error,
  onRetry,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onYearSelect,
  onClearDates,
  viewState,
  onViewStateChange,
}: StatsDashboardProps) {
  const t = useTranslations('stats');
  const tCategory = useTranslations('category');
  const locale = useLocale();
  const numberLocale =
    locale === 'zh' ? 'zh-TW' : locale === 'jp' ? 'ja-JP' : locale === 'zh-CN' ? 'zh-CN' : 'en-US';
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: 'TWD',
      maximumFractionDigits: 0,
    }).format(amount);
  const formatDate = (date: string) =>
    new Intl.DateTimeFormat(numberLocale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));

  const { dimension, metric, interval, detailFilters } = viewState;
  const selectedPeriod =
    detailFilters.periodStart && detailFilters.periodEnd
      ? { startDate: detailFilters.periodStart, endDate: detailFilters.periodEnd }
      : null;
  const dimensionValue =
    dimension === 'trip'
      ? detailFilters.tripId
      : dimension === 'tag'
        ? detailFilters.tag
        : detailFilters.category;
  const updateViewState = (patch: Partial<StatsDashboardViewState>) =>
    onViewStateChange({ ...viewState, ...patch });
  const updateDetailFilters = (patch: Partial<StatsDetailFilters>) =>
    updateViewState({ detailFilters: { ...detailFilters, ...patch } });
  const [sort, setSort] = useState<Sort>('amount');
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>('dateDesc');
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const selectedAdvancedInsight = useRef<StatsInsight['type'] | null>(null);

  const items = useMemo(() => {
    if (!stats) return [];
    const result = dimensionItems(dimension, stats, (key) => tCategory(key));
    return result.sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, numberLocale)
        : sort === 'count'
          ? b.count - a.count
          : b.total - a.total
    );
  }, [dimension, stats, sort, numberLocale, tCategory]);
  const filteredDetails = useMemo(() => {
    return (stats?.recentExpenses ?? [])
      .filter(
        (detail) =>
          (!detailFilters.tripId || detail.tripId === detailFilters.tripId) &&
          (!detailFilters.category || detail.category === detailFilters.category) &&
          (!detailFilters.tag || detail.tags?.includes(detailFilters.tag)) &&
          (!detailFilters.expenseId || detail.id === detailFilters.expenseId) &&
          (!detailFilters.periodStart || detail.date >= detailFilters.periodStart) &&
          (!detailFilters.periodEnd || detail.date <= detailFilters.periodEnd)
      )
      .sort((a, b) => {
        if (expenseSort === 'dateAsc') return a.date.localeCompare(b.date);
        if (expenseSort === 'amountDesc') return b.amount - a.amount;
        if (expenseSort === 'amountAsc') return a.amount - b.amount;
        return b.date.localeCompare(a.date);
      });
  }, [detailFilters, expenseSort, stats?.recentExpenses]);
  const insights = useMemo<InsightItem[]>(() => {
    if (!stats) return [];
    const topTrip = dimensionItems('trip', stats, (key) => tCategory(key))[0];
    const topCategory = dimensionItems('category', stats, (key) => tCategory(key))[0];
    const topTag = dimensionItems('tag', stats, (key) => tCategory(key))[0];

    return [
      topTrip && {
        key: 'trip',
        label: t('topSpendingTrip'),
        dimension: 'trip' as const,
        item: topTrip,
        icon: Plane,
      },
      topCategory && {
        key: 'category',
        label: t('topSpendingCategory'),
        dimension: 'category' as const,
        item: topCategory,
        icon: Layers3,
      },
      topTag && {
        key: 'tag',
        label: t('topSpendingTag'),
        dimension: 'tag' as const,
        item: topTag,
        icon: Tag,
      },
    ].filter((insight): insight is InsightItem => Boolean(insight));
  }, [stats, t, tCategory]);
  if (loading && !stats) return <StatsDashboardSkeleton />;

  const hasExpenses = (stats?.totalExpenses ?? 0) > 0;
  const cards = [
    {
      label: t('totalSpent'),
      value: formatCurrency(stats?.totalAmount ?? 0),
      icon: CircleDollarSign,
    },
    {
      label: t('averagePerTrip'),
      value: formatCurrency(stats?.averagePerTrip ?? 0),
      icon: Calculator,
    },
    {
      label: t('tripCount'),
      value: t('tripCountValue', { count: stats?.tripCount ?? 0 }),
      icon: Plane,
    },
    {
      label: t('expenseTotal'),
      value: t('expenseCount', { count: stats?.totalExpenses ?? 0 }),
      icon: ReceiptText,
    },
  ];

  const selectInsight = (insight: InsightItem) => {
    const filterKey =
      insight.dimension === 'trip' ? 'tripId' : insight.dimension === 'tag' ? 'tag' : 'category';
    updateViewState({
      dimension: insight.dimension,
      detailFilters: {
        [filterKey]: insight.item.id,
      },
    });
    globalThis.requestAnimationFrame?.(() => {
      document.getElementById('stats-expense-details')?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const selectAdvancedInsight = (insight: StatsInsight) => {
    selectedAdvancedInsight.current = insight.type;
    trackProductEvent('stats_insight_action', {
      ruleVersion: stats!.insightRuleVersion,
      insightType: insight.type,
      action: 'view_details',
    });
    updateViewState({
      dimension: insight.filter.category ? 'category' : insight.filter.tag ? 'tag' : 'trip',
      detailFilters: {
        tripId: insight.filter.tripId,
        category: insight.filter.category,
        tag: insight.filter.tag,
        periodStart: insight.filter.startDate,
        periodEnd: insight.filter.endDate,
        expenseId: insight.filter.expenseId,
      },
    });
    setShowAllExpenses(true);
    globalThis.requestAnimationFrame?.(() => {
      document.getElementById('stats-expense-details')?.scrollIntoView?.({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const clearDetailFilters = () => {
    if (selectedAdvancedInsight.current) {
      trackProductEvent('stats_insight_action', {
        ruleVersion: stats!.insightRuleVersion,
        insightType: selectedAdvancedInsight.current,
        action: 'clear_filters',
      });
      selectedAdvancedInsight.current = null;
    }
    updateViewState({ detailFilters: {} });
  };

  const dateFilter = (
    <DateRangeFilter
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={(value) => {
        updateDetailFilters({ periodStart: undefined, periodEnd: undefined });
        onStartDateChange(value);
      }}
      onEndDateChange={(value) => {
        updateDetailFilters({ periodStart: undefined, periodEnd: undefined });
        onEndDateChange(value);
      }}
      onYearSelect={(year) => {
        updateDetailFilters({ periodStart: undefined, periodEnd: undefined });
        onYearSelect(year);
      }}
      onClearDates={() => {
        updateDetailFilters({ periodStart: undefined, periodEnd: undefined });
        onClearDates();
      }}
      t={t}
    />
  );

  const pageHeader = (
    <div className="mb-6 flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-sm text-muted-foreground">{t('dashboardSubtitle')}</p>
    </div>
  );

  if (error && !stats) {
    return (
      <main className="container mx-auto max-w-7xl px-4 py-6 pb-12">
        {pageHeader}
        <div className="mb-6">{dateFilter}</div>
        <ErrorState
          title={t('loadErrorTitle')}
          message={t('loadErrorDescription')}
          onRetry={onRetry}
          retryText={t('retry')}
        />
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-7xl px-4 py-6 pb-12">
      {pageHeader}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertTitle>{t('updateErrorTitle')}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t('updateErrorDescription')}</span>
            <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCcw className="h-4 w-4" aria-hidden />
              )}
              {t('retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6">{dateFilter}</div>

      {loading && stats && (
        <div
          role="status"
          className="mb-6 flex items-center justify-center gap-2 rounded-lg bg-muted/60 px-4 py-2 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('updating')}
        </div>
      )}

      {!hasExpenses ? (
        <EmptyState
          icon={ReceiptText}
          title={startDate || endDate ? t('emptyPeriodTitle') : t('emptyAllTimeTitle')}
          description={
            startDate || endDate ? t('emptyPeriodDescription') : t('emptyAllTimeDescription')
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={ROUTES.QUICK_ADD}>{t('logExpense')}</Link>
              </Button>
              {(startDate || endDate) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    updateViewState({ detailFilters: {} });
                    onClearDates();
                  }}
                >
                  {t('viewAllTime')}
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <>
          <section
            className="mb-6 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4"
            aria-label={t('statsSummary')}
          >
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label}>
                  <Card className="h-full border-muted">
                    <CardContent className="p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{card.label}</span>
                        <Icon size={18} className="text-primary" aria-hidden />
                      </div>
                      <p className="truncate text-xl font-bold sm:text-2xl">{card.value}</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </section>

          <section className="mb-6" aria-labelledby="stats-insights-heading">
            <div className="mb-3">
              <h2 id="stats-insights-heading" className="font-semibold">
                {t('travelInsights')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('insightHint')}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {insights.map((insight) => {
                const Icon = insight.icon;
                const selected = dimensionValue === insight.item.id;
                return (
                  <button
                    key={insight.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={t('filterInsight', {
                      insight: insight.label,
                      name: insight.item.name,
                    })}
                    onClick={() => selectInsight(insight)}
                    className="min-w-0 text-left"
                  >
                    <Card
                      className={cn(
                        'h-full border-muted transition hover:border-primary hover:bg-primary/[0.03]',
                        selected && 'border-primary bg-primary/5'
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Icon size={17} className="text-primary" aria-hidden />
                            {insight.label}
                          </span>
                          <ArrowRight size={17} className="text-primary" aria-hidden />
                        </div>
                        <p className="truncate font-semibold">{insight.item.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatCurrency(insight.item.total)} ·{' '}
                          {t('expenseCount', { count: insight.item.count })}
                        </p>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          </section>

          <RuleBasedInsights
            stats={stats!}
            t={t}
            categoryName={(key) => tCategory(key)}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            activeFilters={detailFilters}
            onSelect={selectAdvancedInsight}
          />

          <section className="mb-6">
            <ExpenseHistogram
              timeline={stats!.timeline}
              startDate={stats?.startDate ?? startDate}
              endDate={stats?.endDate ?? endDate}
              formatCurrency={formatCurrency}
              t={t}
              locale={numberLocale}
              metric={metric}
              onMetricChange={(value) => updateViewState({ metric: value })}
              interval={interval}
              onIntervalChange={(value) => updateViewState({ interval: value })}
              selectedPeriod={selectedPeriod}
              onPeriodSelect={(value) =>
                updateDetailFilters({
                  periodStart: value?.startDate,
                  periodEnd: value?.endDate,
                  expenseId: undefined,
                })
              }
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <Card className="border-muted">
              <CardContent className="p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-auto">
                    {(
                      [
                        ['category', Layers3],
                        ['trip', Plane],
                        ['tag', Tag],
                      ] as const
                    )
                      .filter(([value]) => value !== 'tag' || (stats?.tagStats.length ?? 0) > 0)
                      .map(([value, Icon]) => (
                        <button
                          type="button"
                          key={value}
                          aria-pressed={dimension === value}
                          onClick={() => {
                            updateViewState({ dimension: value });
                          }}
                          className={cn(
                            'flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-sm sm:gap-2 sm:px-3',
                            dimension === value && 'bg-background font-medium shadow-sm'
                          )}
                        >
                          <Icon size={16} aria-hidden />
                          {t(`dimension${value[0].toUpperCase()}${value.slice(1)}`)}
                        </button>
                      ))}
                  </div>
                  <select
                    aria-label={t('sortBy')}
                    value={sort}
                    onChange={(event) => setSort(event.target.value as Sort)}
                    className="min-h-11 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="amount">{t('sortAmount')}</option>
                    <option value="count">{t('sortCount')}</option>
                    <option value="name">{t('sortName')}</option>
                  </select>
                </div>

                {Object.keys(detailFilters).some(
                  (key) => detailFilters[key as keyof StatsDetailFilters]
                ) && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {detailFilters.tripId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateDetailFilters({ tripId: undefined })}
                      >
                        {stats?.tripStats.find((trip) => trip.tripId === detailFilters.tripId)
                          ?.tripName ?? detailFilters.tripId}
                        <X size={14} aria-hidden />
                      </Button>
                    )}
                    {detailFilters.category && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateDetailFilters({ category: undefined })}
                      >
                        {tCategory(detailFilters.category)}
                        <X size={14} aria-hidden />
                      </Button>
                    )}
                    {detailFilters.tag && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => updateDetailFilters({ tag: undefined })}
                      >
                        {detailFilters.tag}
                        <X size={14} aria-hidden />
                      </Button>
                    )}
                    {selectedPeriod && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateDetailFilters({ periodStart: undefined, periodEnd: undefined })
                        }
                      >
                        {formatDate(selectedPeriod.startDate)}–{formatDate(selectedPeriod.endDate)}
                        <X size={14} aria-hidden />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={clearDetailFilters}>
                      {t('clearFilters')}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {items.map((item) => {
                    const percentage = Math.round(
                      (item.total / Math.max(stats?.totalAmount ?? 1, 1)) * 100
                    );
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          'rounded-xl border p-3 transition',
                          dimensionValue === item.id
                            ? 'border-primary bg-primary/5'
                            : 'border-muted'
                        )}
                      >
                        <button
                          type="button"
                          className="min-h-11 w-full text-left"
                          aria-pressed={dimensionValue === item.id}
                          onClick={() => {
                            const filterKey =
                              dimension === 'trip'
                                ? 'tripId'
                                : dimension === 'tag'
                                  ? 'tag'
                                  : 'category';
                            updateDetailFilters({
                              [filterKey]: dimensionValue === item.id ? undefined : item.id,
                              expenseId: undefined,
                            });
                          }}
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t('dimensionMeta', { count: item.count, percentage })}
                              </p>
                            </div>
                            <span className="font-semibold">{formatCurrency(item.total)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.max(2, (item.total / Math.max(items[0]?.total ?? 1, 1)) * 100)}%`,
                              }}
                            />
                          </div>
                        </button>
                        {item.href && (
                          <Link
                            href={item.href}
                            className="mt-2 inline-flex min-h-11 items-center text-sm text-primary hover:underline"
                          >
                            {t('viewTripExpenses')}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                  {!items.length && (
                    <p className="py-10 text-center text-muted-foreground">{t('noData')}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card id="stats-expense-details" className="scroll-mt-4 border-muted">
              <CardContent className="p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <ReceiptText size={18} className="text-primary" aria-hidden />
                    <h2 className="font-semibold">{t('filteredExpenses')}</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={t('expenseSort')}
                      value={expenseSort}
                      onChange={(event) => setExpenseSort(event.target.value as ExpenseSort)}
                      className="min-h-11 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="dateDesc">{t('expenseSortNewest')}</option>
                      <option value="dateAsc">{t('expenseSortOldest')}</option>
                      <option value="amountDesc">{t('expenseSortHighest')}</option>
                      <option value="amountAsc">{t('expenseSortLowest')}</option>
                    </select>
                    {filteredDetails.length > 5 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllExpenses(!showAllExpenses)}
                      >
                        {showAllExpenses ? t('showLess') : t('viewAll')}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="divide-y">
                  {filteredDetails.slice(0, showAllExpenses ? undefined : 5).map((detail) => (
                    <Link
                      href={
                        detail.tripId
                          ? `${ROUTES.TRIP_EXPENSES(detail.tripId)}?expense=${detail.id}`
                          : ROUTES.TRIPS
                      }
                      key={detail.id}
                      className="flex min-h-16 items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {detail.description || t('noDescription')}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(detail.date)} · {detail.tripName}
                          {detail.category ? ` · ${tCategory(detail.category)}` : ''}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold">
                        {formatCurrency(detail.amount)}
                      </span>
                    </Link>
                  ))}
                  {!filteredDetails.length && (
                    <div className="py-10 text-center">
                      <p className="mb-3 text-sm text-muted-foreground">
                        {t('noFilteredExpenses')}
                      </p>
                      <Button variant="outline" onClick={clearDetailFilters}>
                        {t('clearFilters')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </main>
  );
}
