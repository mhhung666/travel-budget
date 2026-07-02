'use client';

import { useTranslations } from 'next-intl';
import type { Member } from '@/types';
import type { SplitComputation, SplitMode } from '@/lib/expenseSplit';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SplitState } from './useExpenseForm';

interface SplitSectionProps {
  members: Member[];
  splitMode: SplitMode;
  splitState: SplitState;
  split: SplitComputation;
  currency: string;
  anySelected: boolean;
  originalAmount: number;
  totalAmountTWD: number;
  onModeChange: (mode: string) => void;
  onToggle: (userId: string) => void;
  onValueChange: (userId: string, value: string) => void;
  onSelectAll: () => void;
}

/** 分帳對象：模式切換（均分／金額／百分比／份數）＋成員列＋分配摘要。 */
export function SplitSection({
  members,
  splitMode,
  splitState,
  split,
  currency,
  anySelected,
  originalAmount,
  totalAmountTWD,
  onModeChange,
  onToggle,
  onValueChange,
  onSelectAll,
}: SplitSectionProps) {
  const tExpense = useTranslations('expense');
  const tCommon = useTranslations('common');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tExpense('form.splitWith')}
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          className="h-6 px-2 text-xs"
        >
          {tCommon('toggleAll')}
        </Button>
      </div>

      {/* Split mode selector */}
      <ToggleGroup
        type="single"
        value={splitMode}
        onValueChange={onModeChange}
        className="grid grid-cols-4 gap-1"
      >
        {(['equal', 'amount', 'percent', 'shares'] as SplitMode[]).map((m) => (
          <ToggleGroupItem
            key={m}
            value={m}
            className="h-8 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            {tExpense(`split.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="space-y-2">
        {members.map((member) => {
          const state = splitState[member.id] || { selected: false, value: '' };
          const twdShare = split.twd[member.id] || 0;
          const unit =
            splitMode === 'percent'
              ? '%'
              : splitMode === 'shares'
                ? tExpense('split.shareUnit')
                : currency;

          return (
            <div
              key={member.id}
              className={cn(
                'flex items-center justify-between rounded-lg border p-2 transition-all',
                state.selected
                  ? 'border-primary/20 bg-primary/5'
                  : 'border-border bg-transparent opacity-60'
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={state.selected}
                  onCheckedChange={() => onToggle(member.id)}
                  id={`split-${member.id}`}
                />
                <Label htmlFor={`split-${member.id}`} className="cursor-pointer font-medium">
                  {member.display_name}
                </Label>
              </div>

              {state.selected ? (
                <div className="flex items-center gap-2">
                  {/* converted TWD share */}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    ${Math.round(twdShare).toLocaleString()}
                  </span>
                  {splitMode !== 'equal' && (
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder={splitMode === 'shares' ? '1' : '0'}
                        value={state.value}
                        onChange={(e) => onValueChange(member.id, e.target.value)}
                        type="number"
                        min="0"
                        className="h-8 w-20 bg-background pr-1 text-right shadow-sm focus-visible:ring-1"
                      />
                      <span className="w-8 text-xs text-muted-foreground">{unit}</span>
                    </div>
                  )}
                </div>
              ) : (
                <span className="pr-2 text-xs text-muted-foreground">--</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Allocation summary (TWD) */}
      {anySelected && originalAmount > 0 && (
        <p className="px-1 text-xs tabular-nums text-muted-foreground">
          {tExpense('split.allocated', {
            allocated: `$${Math.round(split.allocatedTWD).toLocaleString()}`,
            total: `$${Math.round(totalAmountTWD).toLocaleString()}`,
          })}
        </p>
      )}
    </div>
  );
}
