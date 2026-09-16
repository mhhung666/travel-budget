'use client';

import { useTranslations } from 'next-intl';
import type { Member } from '@/types';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PayerDateFieldsProps {
  payerId: string;
  date: string;
  onPayerChange: (payerId: string) => void;
  onDateChange: (date: string) => void;
  members: Member[];
  currentUserId?: string;
}

/** 付款人＋日期：預設「我付款／今天」，直接露出在主要欄位下方，不必展開即可修改。 */
export function PayerDateFields({
  payerId,
  date,
  onPayerChange,
  onDateChange,
  members,
  currentUserId,
}: PayerDateFieldsProps) {
  const tExpense = useTranslations('expense');

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="min-w-0 space-y-1">
        <Label className="text-xs text-muted-foreground">{tExpense('form.payer')}</Label>
        <Select value={payerId.toString()} onValueChange={onPayerChange}>
          <SelectTrigger aria-label={tExpense('form.payer')}>
            <SelectValue placeholder={tExpense('form.payerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id.toString()}>
                {member.id === currentUserId
                  ? tExpense('form.payerSelf', { name: member.display_name })
                  : member.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 space-y-1">
        <Label htmlFor="expense-date" className="text-xs text-muted-foreground">
          {tExpense('form.date')}
        </Label>
        <Input
          id="expense-date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>
    </div>
  );
}
