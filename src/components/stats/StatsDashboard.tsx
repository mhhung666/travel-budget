'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  AlertCircle,
  CalendarDays,
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
import type {
  CategoryStat,
  ExpenseDetail,
  PersonalTripStat,
  StatsData,
  TagStat,
  TimeInterval,
} from '@/types';
import { StatsDashboardSkeleton } from '@/components/skeletons';
import { EmptyState, ErrorState } from '@/components/common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

type Dimension = 'category' | 'trip' | 'tag';
type Metric = 'amount' | 'count';
type Sort = 'amount' | 'count' | 'name';
type ExpenseSort = 'dateDesc' | 'dateAsc' | 'amountDesc' | 'amountAsc';
export interface StatsDashboardViewState {
  dimension: Dimension;
  dimensionValue?: string;
  metric: Metric;
  interval: TimeInterval;
  selectedPeriod: { startDate: string; endDate: string } | null;
}
type DimensionItem = {
  id: string;
  name: string;
  total: number;
  count: number;
  details: ExpenseDetail[];
  href?: string;
};

interface StatsDashboardProps {
  stats: StatsData | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  startDate: string;
  endDate: string;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onYearSelect: (year: number) => void;
  onClearDates: () => void;
  viewState: StatsDashboardViewState;
  onViewStateChange: (state: StatsDashboardViewState) => void;
}

function comparisonPercent(current: number, previous?: number) {
  if (previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
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
  compare,
  onCompareChange,
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

  const { dimension, dimensionValue, metric, interval, selectedPeriod } = viewState;
  const updateViewState = (patch: Partial<StatsDashboardViewState>) =>
    onViewStateChange({ ...viewState, ...patch });
  const [sort, setSort] = useState<Sort>('amount');
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>('dateDesc');
  const [showAllExpenses, setShowAllExpenses] = useState(false);

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
  const previousItems = useMemo(
    () =>
      stats?.comparison
        ? dimensionItems(
            dimension,
            {
              categoryStats: stats.comparison.categoryStats,
              tripStats: stats.comparison.tripStats,
              tagStats: stats.comparison.tagStats,
            },
            (key) => tCategory(key)
          )
        : [],
    [dimension, stats, tCategory]
  );
  const selectedItem = items.find((item) => item.id === dimensionValue);
  const baseDetails = selectedItem?.details ?? stats?.recentExpenses ?? [];
  const filteredDetails = baseDetails
    .filter(
      (detail) =>
        !selectedPeriod ||
        (detail.date >= selectedPeriod.startDate && detail.date <= selectedPeriod.endDate)
    )
    .sort((a, b) => {
      if (expenseSort === 'dateAsc') return a.date.localeCompare(b.date);
      if (expenseSort === 'amountDesc') return b.amount - a.amount;
      if (expenseSort === 'amountAsc') return a.amount - b.amount;
      return b.date.localeCompare(a.date);
    });
  const chartStats: CategoryStat[] = selectedItem
    ? [
        {
          category: selectedItem.name,
          total: selectedItem.total,
          count: selectedItem.count,
          details: selectedItem.details,
        },
      ]
    : (stats?.categoryStats ?? []);
  const previousSelected = previousItems.find((item) => item.id === dimensionValue);
  const comparisonChartStats: CategoryStat[] = dimensionValue
    ? previousSelected
      ? [
          {
            category: previousSelected.name,
            total: previousSelected.total,
            count: previousSelected.count,
            details: previousSelected.details,
          },
        ]
      : []
    : (stats?.comparison?.categoryStats ?? []);

  if (loading && !stats) return <StatsDashboardSkeleton />;

  const hasExpenses = (stats?.totalExpenses ?? 0) > 0;
  const topCategory = stats?.categoryStats[0];
  const cards = [
    {
      label: t('totalSpent'),
      value: formatCurrency(stats?.totalAmount ?? 0),
      icon: CircleDollarSign,
      current: stats?.totalAmount ?? 0,
      previous: stats?.comparison?.totalAmount,
    },
    {
      label: t('dailyAverage'),
      value: formatCurrency(stats?.dailyAverage ?? 0),
      icon: CalendarDays,
      current: stats?.dailyAverage ?? 0,
      previous: stats?.comparison?.dailyAverage,
    },
    {
      label: t('tripCount'),
      value: t('tripCountValue', { count: stats?.tripCount ?? 0 }),
      icon: Plane,
      action: () => {
        updateViewState({ dimension: 'trip', dimensionValue: undefined });
      },
    },
    {
      label: t('topCategory'),
      value: topCategory ? tCategory(topCategory.category) : t('noData'),
      detail: topCategory
        ? `${formatCurrency(topCategory.total)} · ${Math.round((topCategory.total / Math.max(stats?.totalAmount ?? 1, 1)) * 100)}%`
        : undefined,
      icon: Layers3,
    },
  ];

  const dateFilter = (
    <DateRangeFilter
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={(value) => {
        updateViewState({ selectedPeriod: null });
        onStartDateChange(value);
      }}
      onEndDateChange={(value) => {
        updateViewState({ selectedPeriod: null });
        onEndDateChange(value);
      }}
      onYearSelect={onYearSelect}
      onClearDates={onClearDates}
      compare={compare}
      onCompareChange={onCompareChange}
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
                    updateViewState({ dimensionValue: undefined, selectedPeriod: null });
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
            className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"
            aria-label={t('insights')}
          >
            {cards.map((card) => {
              const change = comparisonPercent(card.current ?? 0, card.previous);
              const Icon = card.icon;
              const content = (
                <Card
                  className={cn(
                    'h-full border-muted',
                    card.action && 'transition hover:border-primary'
                  )}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{card.label}</span>
                      <Icon size={18} className="text-primary" aria-hidden />
                    </div>
                    <p className="truncate text-xl font-bold sm:text-2xl">{card.value}</p>
                    {card.detail && (
                      <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
                    )}
                    {card.previous !== undefined && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        {change === null ? (
                          t('noPreviousSpend')
                        ) : (
                          <>
                            {change > 0 ? (
                              <ArrowUpRight size={14} aria-hidden />
                            ) : change < 0 ? (
                              <ArrowDownRight size={14} aria-hidden />
                            ) : null}
                            {t('comparedWithPrevious', { value: Math.abs(change) })}
                          </>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
              return card.action ? (
                <button key={card.label} type="button" onClick={card.action} className="text-left">
                  {content}
                </button>
              ) : (
                <div key={card.label}>{content}</div>
              );
            })}
          </section>

          <section className="mb-6">
            <ExpenseHistogram
              categoryStats={chartStats}
              comparisonStats={comparisonChartStats}
              startDate={stats?.startDate ?? startDate}
              endDate={stats?.endDate ?? endDate}
              comparisonStartDate={stats?.comparison?.startDate}
              comparisonEndDate={stats?.comparison?.endDate}
              formatCurrency={formatCurrency}
              t={t}
              locale={numberLocale}
              metric={metric}
              onMetricChange={(value) => updateViewState({ metric: value })}
              interval={interval}
              onIntervalChange={(value) => updateViewState({ interval: value })}
              selectedPeriod={selectedPeriod}
              onPeriodSelect={(value) => updateViewState({ selectedPeriod: value })}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <Card className="border-muted">
              <CardContent className="p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
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
                            updateViewState({ dimension: value, dimensionValue: undefined });
                          }}
                          className={cn(
                            'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm',
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

                {dimensionValue && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mb-4"
                    onClick={() => updateViewState({ dimensionValue: undefined })}
                  >
                    {selectedItem?.name}
                    <X size={14} aria-hidden />
                  </Button>
                )}

                <div className="space-y-2">
                  {items.map((item) => {
                    const previous = previousItems.find((value) => value.id === item.id);
                    const change = comparisonPercent(item.total, previous?.total);
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
                          onClick={() =>
                            updateViewState({
                              dimensionValue: dimensionValue === item.id ? undefined : item.id,
                            })
                          }
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {t('dimensionMeta', { count: item.count, percentage })}
                                {change !== null && previous
                                  ? ` · ${t('changePercent', { value: change })}`
                                  : ''}
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

            <Card className="border-muted">
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
                      <Button
                        variant="outline"
                        onClick={() => {
                          updateViewState({ dimensionValue: undefined, selectedPeriod: null });
                        }}
                      >
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
