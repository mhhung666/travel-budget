'use client';

import { ChevronDown, ChevronUp, Plus, Edit2, Trash2, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getCategoryIcon, CATEGORY_CODES } from '@/constants/categories';
import type { Expense, Member, ItineraryDay } from '@/types';
import { ExportMenu } from '@/components/export';
import { exportExpenses, type ExportFormat } from '@/lib/exporters';
import { ReceiptThumb } from '@/components/trips/detail/ReceiptAttachments';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

interface TripExpensesProps {
  tripId: string;
  expenses: Expense[];
  members: Member[];
  itineraryDays?: ItineraryDay[];
  tripName?: string;
  isCurrentUserMember: boolean;
  filterMemberId: string | 'all';
  onFilterChange: (id: string | 'all') => void;
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
  filterMemberId,
  onFilterChange,
  onAdd,
  onEdit,
  onDelete,
  expanded,
  onToggleExpand,
}: TripExpensesProps) {
  const tExpense = useTranslations('expense');
  const tExport = useTranslations('export');
  const tCategory = useTranslations('category');

  // 行程日 id → 日序，供支出卡顯示「Day N」標籤。
  const dayNumberById = new Map(itineraryDays.map((d) => [d.id, d.day_number]));

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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="w-full sm:w-[200px] flex items-center gap-2">
                <Label htmlFor="member-filter" className="whitespace-nowrap sr-only sm:not-sr-only">
                  {tExpense('filter')}
                </Label>
                <Select
                  value={filterMemberId.toString()}
                  onValueChange={(value) => onFilterChange(value === 'all' ? 'all' : value)}
                >
                  <SelectTrigger id="member-filter">
                    <SelectValue placeholder={tExpense('filter')} />
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

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <ExportMenu
                  build={buildExport}
                  fileBaseName={`${tripName ?? 'trip'}-${tExport('expense.heading')}`}
                  disabled={expenses.length === 0}
                  size="default"
                />
                {isCurrentUserMember && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAdd(e);
                    }}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {tExpense('add')}
                  </Button>
                )}
              </div>
            </div>

            {(() => {
              const filteredExpenses =
                filterMemberId === 'all'
                  ? expenses
                  : expenses.filter((expense) =>
                      expense.splits.some((split) => split.user_id === filterMemberId)
                    );

              if (expenses.length === 0) {
                return (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-1">{tExpense('noExpenses')}</p>
                    {isCurrentUserMember && (
                      <p className="text-sm text-muted-foreground">{tExpense('clickToAdd')}</p>
                    )}
                  </div>
                );
              }

              if (filteredExpenses.length === 0) {
                return (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-1">{tExpense('noFilterResults')}</p>
                    <p className="text-sm text-muted-foreground">
                      {tExpense('noFilterResultsHint')}
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {filteredExpenses.map((expense) => (
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
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {expense.payer_name} {tExpense('paidBy')} •{' '}
                              {new Date(expense.date).toLocaleDateString()}
                            </p>
                            {expense.itinerary_day_id &&
                              dayNumberById.has(expense.itinerary_day_id) && (
                                <Badge
                                  variant="secondary"
                                  className="gap-1 font-normal text-muted-foreground"
                                >
                                  <CalendarDays className="h-3 w-3" />
                                  Day {dayNumberById.get(expense.itinerary_day_id)}
                                </Badge>
                              )}
                          </div>

                          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4 sm:gap-1">
                            <div className="text-right">
                              {expense.currency !== 'TWD' ? (
                                <>
                                  <div className="text-xs text-muted-foreground">
                                    {Number(expense.original_amount).toLocaleString()}{' '}
                                    {expense.currency} ({tExpense('rate')} {expense.exchange_rate})
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

                            {isCurrentUserMember && (
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
                              <Badge key={split.user_id} variant="outline" className="font-normal">
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
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
