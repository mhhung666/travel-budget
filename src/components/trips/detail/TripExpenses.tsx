'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, ReceiptText, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { EmptyState } from '@/components/common';
import { useTranslations } from 'next-intl';
import { getCategoryIcon, CATEGORY_CODES } from '@/constants/categories';
import { formatCurrency } from '@/constants/currencies';
import type { Expense, Member, ItineraryDay } from '@/types';
import { ExportMenu } from '@/components/export';
import { exportExpenses, type ExportFormat } from '@/lib/exporters';
import ExpenseListItem from '@/components/trips/detail/ExpenseListItem';
import { useCommentCounts } from '@/hooks/queries';
import {
  filterExpenses,
  countActiveFilters,
  EMPTY_EXPENSE_FILTERS,
  type ExpenseFilters,
} from '@/lib/expenseFilters';

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
  currentUserId?: string;
  isCurrentUserAdmin: boolean;
  filters: ExpenseFilters;
  onFiltersChange: (filters: ExpenseFilters) => void;
  onAdd: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
}

/** 依日期（當地時區的同一天）分組後的一段支出。 */
interface ExpenseDayGroup {
  /** 穩定 key（該日第一筆的 toDateString）。 */
  key: string;
  label: string;
  total: number;
  expenses: Expense[];
}

/**
 * 支出分頁的內容：工具列（搜尋／篩選／匯出／新增）+ 依日期分組的支出列表。
 * 旅途中的心智模型是「今天花了什麼」，故以日期為段落、每段顯示當日小計；
 * 每筆為單行摘要，點擊展開詳情（ExpenseListItem）。不再包 Card／Collapsible —
 * 這就是頁面的主內容。
 */
export default function TripExpenses({
  tripId,
  expenses,
  members,
  itineraryDays = [],
  tripName,
  isCurrentUserMember,
  currentUserId,
  isCurrentUserAdmin,
  filters,
  onFiltersChange,
  onAdd,
  onEdit,
  onDelete,
}: TripExpensesProps) {
  const tExpense = useTranslations('expense');
  const tExport = useTranslations('export');
  const tCategory = useTranslations('category');

  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { data: commentCounts = {} } = useCommentCounts(tripId);

  const toggleExpanded = (expenseId: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(expenseId)) next.delete(expenseId);
      else next.add(expenseId);
      return next;
    });

  // 行程日 id → 日序，供支出項顯示「Day N」標籤。
  const dayNumberById = useMemo(
    () => new Map(itineraryDays.map((d) => [d.id, d.day_number])),
    [itineraryDays]
  );

  // 本 trip 內出現過的所有標籤（供標籤篩選下拉）。
  const allTags = useMemo(() => [...new Set(expenses.flatMap((e) => e.tags))].sort(), [expenses]);

  const activeCount = countActiveFilters(filters);
  const filtered = useMemo(() => filterExpenses(expenses, filters), [expenses, filters]);
  const visible = filtered.slice(0, visibleCount);

  // 依日期分組（沿用伺服器的日期排序；同一天以當地時區歸組）。
  const groups = useMemo<ExpenseDayGroup[]>(() => {
    const byDay = new Map<string, ExpenseDayGroup>();
    for (const expense of visible) {
      const day = new Date(expense.date);
      const key = day.toDateString();
      let group = byDay.get(key);
      if (!group) {
        group = {
          key,
          label: day.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            weekday: 'short',
          }),
          total: 0,
          expenses: [],
        };
        byDay.set(key, group);
      }
      group.total += expense.amount;
      group.expenses.push(expense);
    }
    return [...byDay.values()];
  }, [visible]);

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
        tags: tExport('expense.colTags'),
      },
      category: (key) => (CATEGORY_CODES.includes(key) ? tCategory(key) : key),
    });

  return (
    <section aria-label={tExpense('title')}>
      {/* Toolbar: search + filter toggle + export + add（行動端的新增走空間 FAB） */}
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
                <Badge variant="default" className="ml-1 h-5 min-w-[1.25rem] justify-center px-1.5">
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
            {isCurrentUserMember && expenses.length > 0 && (
              <Button
                onClick={onAdd}
                className="hidden gap-2 whitespace-nowrap px-3 sm:px-4 md:inline-flex"
                aria-label={tExpense('add')}
              >
                <Plus className="h-4 w-4" />
                <span>{tExpense('add')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Advanced filter panel */}
        {showFilters && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

              <div className="space-y-1.5">
                <Label htmlFor="filter-tag">{tExpense('filterTag')}</Label>
                <Select
                  value={filters.tag}
                  onValueChange={(value) => updateFilters({ tag: value })}
                >
                  <SelectTrigger id="filter-tag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tExpense('filterAll')}</SelectItem>
                    {allTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="grid flex-1 grid-cols-2 gap-2">
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
        <EmptyState
          icon={ReceiptText}
          title={tExpense('noExpenses')}
          description={isCurrentUserMember ? tExpense('clickToAdd') : undefined}
          action={
            isCurrentUserMember ? (
              <Button onClick={onAdd} className="gap-2">
                <Plus className="h-4 w-4" />
                {tExpense('addFirst')}
              </Button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={tExpense('noFilterResults')}
          description={tExpense('noFilterResultsHint')}
        />
      ) : (
        <>
          {activeCount > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">
              {tExpense('resultCount', { count: filtered.length })}
            </p>
          )}
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.key} className="space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatCurrency(Math.round(group.total), 'TWD')}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.expenses.map((expense) => (
                    <ExpenseListItem
                      key={expense.id}
                      expense={expense}
                      tripId={tripId}
                      dayNumbers={expense.itinerary_day_ids
                        .filter((id) => dayNumberById.has(id))
                        .map((id) => dayNumberById.get(id)!)
                        .sort((a, b) => a - b)}
                      commentCount={commentCounts[expense.id] ?? 0}
                      isCurrentUserMember={isCurrentUserMember}
                      currentUserId={currentUserId}
                      isCurrentUserAdmin={isCurrentUserAdmin}
                      expanded={expandedIds.has(expense.id)}
                      onToggle={() => toggleExpanded(expense.id)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
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
    </section>
  );
}
