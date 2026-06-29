'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  CalendarDays,
  CloudOff,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCategoryIcon, CATEGORY_CODES } from '@/constants/categories';
import type { Expense, Member, ItineraryDay } from '@/types';
import { ExportMenu } from '@/components/export';
import { exportExpenses, type ExportFormat } from '@/lib/exporters';
import { ReceiptThumb } from '@/components/trips/detail/ReceiptAttachments';
import {
  filterExpenses,
  countActiveFilters,
  EMPTY_EXPENSE_FILTERS,
  type ExpenseFilters,
} from '@/lib/expenseFilters';
import { isOptimisticId } from '@/lib/optimisticExpense';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';

/** 列表初次顯示的筆數，以及每次「顯示更多」的增量（純前端漸進渲染，避免長列表一次塞滿 DOM）。 */
const PAGE_SIZE = 20;

interface TripExpensesProps {
  tripId: string;
  expenses: Expense[];
  members: Member[];
  itineraryDays?: ItineraryDay[];
  tripName?: string;
  isCurrentUserMember: boolean;
  filters: ExpenseFilters;
  onFiltersChange: (filters: ExpenseFilters) => void;
  onAdd: (e: React.MouseEvent) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export default function TripExpenses({
  tripId,
  expenses,
  members,
  itineraryDays = [],
  tripName,
  isCurrentUserMember,
  filters,
  onFiltersChange,
  onAdd,
  onEdit,
  onDelete,
  expanded,
  onToggleExpand,
}: TripExpensesProps) {
  const tExpense = useTranslations('expense');
  const tExport = useTranslations('export');
  const tCategory = useTranslations('category');
  const tOffline = useTranslations('offline');

  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // 行程日 id → 日序，供支出卡顯示「Day N」標籤。
  const dayNumberById = new Map(itineraryDays.map((d) => [d.id, d.day_number]));

  const activeCount = countActiveFilters(filters);
  const filtered = useMemo(() => filterExpenses(expenses, filters), [expenses, filters]);
  const visible = filtered.slice(0, visibleCount);

  // 篩選條件變動時，把漸進渲染的計數重設回第一頁。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 條件變更時刻意重置分頁計數
    setVisibleCount(PAGE_SIZE);
  }, [filters]);

  const updateFilters = (patch: Partial<ExpenseFilters>) =>
    onFiltersChange({ ...filters, ...patch });

  const clearFilters = () => onFiltersChange(EMPTY_EXPENSE_FILTERS);

  const buildExport = (format: ExportFormat) =>
    exportExpenses(expenses, format, {
      heading: tExport('expense.heading'),
      total: tExport('expense.total'),
      columns: {
        date: tExport('expense.colDate'),
        description: tExport('expense.colDescription'),
        category: tExport('expense.colCategory'),
        payer: tExport('expense.colPayer'),
        amountTwd: tExport('expense.colAmountTwd'),
        originalAmount: tExport('expense.colOriginalAmount'),
        currency: tExport('expense.colCurrency'),
        rate: tExport('expense.colRate'),
        splits: tExport('expense.colSplits'),
      },
      category: (key) => (CATEGORY_CODES.includes(key) ? tCategory(key) : key),
    });

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={onToggleExpand}>
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
          <CollapsibleTrigger asChild>
            <div className="flex justify-between items-center cursor-pointer group">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl font-semibold">{tExpense('title')}</CardTitle>
                <Badge variant="secondary" className="px-2 py-0.5 min-w-[1.5rem] justify-center">
                  {expenses.length}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" className="w-9 p-0">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 p-4 sm:p-6">
            {/* Toolbar: search + filter toggle + export + add */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Label htmlFor="expense-search" className="sr-only">
                    {tExpense('search')}
                  </Label>
                  <Input
                    id="expense-search"
                    className="pl-9"
                    placeholder={tExpense('searchPlaceholder')}
                    value={filters.keyword}
                    onChange={(e) => updateFilters({ keyword: e.target.value })}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    variant={showFilters ? 'secondary' : 'outline'}
                    onClick={() => setShowFilters((v) => !v)}
                    className="gap-2 px-3 sm:px-4"
                    aria-label={tExpense('filters')}
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">{tExpense('filters')}</span>
                    {activeCount > 0 && (
                      <Badge
                        variant="default"
                        className="ml-1 h-5 min-w-[1.25rem] justify-center px-1.5"
                      >
                        {activeCount}
                      </Badge>
                    )}
                  </Button>
                  <ExportMenu
                    build={buildExport}
                    fileBaseName={`${tripName ?? 'trip'}-${tExport('expense.heading')}`}
                    disabled={expenses.length === 0}
                    size="default"
                    className="px-3 sm:px-4"
                    labelClassName="hidden sm:inline"
                  />
                  {isCurrentUserMember && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd(e);
                      }}
                      className="gap-2 px-3 whitespace-nowrap sm:px-4"
                      aria-label={tExpense('add')}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="hidden sm:inline">{tExpense('add')}</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Advanced filter panel */}
              {showFilters && (
                <div className="rounded-lg border bg-muted/30 p-3 sm:p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="filter-category">{tExpense('filterCategory')}</Label>
                      <Select
                        value={filters.category}
                        onValueChange={(value) => updateFilters({ category: value })}
                      >
                        <SelectTrigger id="filter-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{tExpense('filterAll')}</SelectItem>
                          {CATEGORY_CODES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {getCategoryIcon(code)} {tCategory(code)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="filter-payer">{tExpense('filterPayer')}</Label>
                      <Select
                        value={filters.payerId}
                        onValueChange={(value) => updateFilters({ payerId: value })}
                      >
                        <SelectTrigger id="filter-payer">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{tExpense('filterAll')}</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="filter-participant">{tExpense('filterParticipant')}</Label>
                      <Select
                        value={filters.participantId}
                        onValueChange={(value) => updateFilters({ participantId: value })}
                      >
                        <SelectTrigger id="filter-participant">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{tExpense('filterAll')}</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id.toString()}>
                              {member.display_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="filter-date-from">{tExpense('dateFrom')}</Label>
                        <Input
                          id="filter-date-from"
                          type="date"
                          value={filters.dateFrom}
                          max={filters.dateTo || undefined}
                          onChange={(e) => updateFilters({ dateFrom: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="filter-date-to">{tExpense('dateTo')}</Label>
                        <Input
                          id="filter-date-to"
                          type="date"
                          value={filters.dateTo}
                          min={filters.dateFrom || undefined}
                          onChange={(e) => updateFilters({ dateTo: e.target.value })}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={clearFilters}
                      disabled={activeCount === 0}
                      className="gap-2 text-muted-foreground"
                    >
                      <X className="h-4 w-4" />
                      {tExpense('filterClear')}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {expenses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-1">{tExpense('noExpenses')}</p>
                {isCurrentUserMember && (
                  <p className="text-sm text-muted-foreground">{tExpense('clickToAdd')}</p>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-1">{tExpense('noFilterResults')}</p>
                <p className="text-sm text-muted-foreground">{tExpense('noFilterResultsHint')}</p>
              </div>
            ) : (
              <>
                {activeCount > 0 && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    {tExpense('resultCount', { count: filtered.length })}
                  </p>
                )}
                <div className="space-y-4">
                  {visible.map((expense) => {
                    const pending = isOptimisticId(expense.id);
                    return (
                      <Card
                        key={expense.id}
                        className="shadow-sm hover:shadow-md transition-shadow border-muted"
                      >
                        <CardContent className="p-4">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-lg" role="img" aria-label="category">
                                  {getCategoryIcon(expense.category)}
                                </span>
                                <h4 className="font-semibold text-base line-clamp-1">
                                  {expense.description}
                                </h4>
                                {pending && (
                                  <Badge
                                    variant="outline"
                                    className="gap-1 font-normal text-amber-600 border-amber-300"
                                  >
                                    <CloudOff className="h-3 w-3" />
                                    {tOffline('pending')}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {expense.payer_name} {tExpense('paidBy')} •{' '}
                                {new Date(expense.date).toLocaleDateString()}
                              </p>
                              {expense.itinerary_day_ids.filter((id) => dayNumberById.has(id))
                                .length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {expense.itinerary_day_ids
                                    .filter((id) => dayNumberById.has(id))
                                    .map((id) => dayNumberById.get(id)!)
                                    .sort((a, b) => a - b)
                                    .map((dayNumber) => (
                                      <Badge
                                        key={dayNumber}
                                        variant="secondary"
                                        className="gap-1 font-normal text-muted-foreground"
                                      >
                                        <CalendarDays className="h-3 w-3" />
                                        Day {dayNumber}
                                      </Badge>
                                    ))}
                                </div>
                              )}
                            </div>

                            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 sm:gap-1">
                              <div className="text-right">
                                {expense.currency !== 'TWD' ? (
                                  <>
                                    <div className="text-xs text-muted-foreground">
                                      {Number(expense.original_amount).toLocaleString()}{' '}
                                      {expense.currency} ({tExpense('rate')} {expense.exchange_rate}
                                      )
                                    </div>
                                    <div className="text-lg font-bold text-primary">
                                      NT${expense.amount.toLocaleString()}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-lg font-bold text-primary">
                                    NT${expense.amount.toLocaleString()}
                                  </div>
                                )}
                              </div>

                              {/* Optimistic (not-yet-synced) rows have no server
                                id, so hide edit/delete until the create lands. */}
                              {isCurrentUserMember && !pending && (
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => onEdit(expense)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => onDelete(expense.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          <Separator className="my-3" />

                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              {tExpense('splitMembers')}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {expense.splits.map((split) => (
                                <Badge
                                  key={split.user_id}
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {split.display_name}: ${split.share_amount.toFixed(0)}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          {expense.attachments && expense.attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {expense.attachments.map((a) => (
                                <ReceiptThumb key={a.key} tripId={tripId} attachment={a} />
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {filtered.length > visibleCount && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      {tExpense('showMore', { count: filtered.length - visibleCount })}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
