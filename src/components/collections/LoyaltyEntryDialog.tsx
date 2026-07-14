'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  LOYALTY_ENTRY_TYPES,
  type LoyaltyProgram,
  type LoyaltyEntryType,
} from '@/constants/loyalty';
import { useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { LoyaltyEntryItem } from '@/types';
import type { CreateLoyaltyEntryInput } from '@/lib/validation';
import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface LoyaltyEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: LoyaltyProgram;
  /** null＝新增；有值＝編輯該筆。 */
  editing: LoyaltyEntryItem | null;
  /** 新增時的預填值（航空 tab「記入會籍積分」帶入用；編輯時忽略）。 */
  defaults?: Partial<CreateLoyaltyEntryInput> | null;
  /** 儲存成功後回呼（帶入情境顯示 toast 用）。 */
  onSaved?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** 手抄數字的寬容解析：空字串/非數字視為 0（積分與里數皆可為負，如兌換/沖銷）。 */
const toInt = (raw: string): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * 積分/里數 entry 補登表單（docs/PLAN-LOYALTY.md §7）：數字由使用者從航空 app 抄過來，
 * 這裡不做任何計算。從飛行紀錄帶入時 `flight_record_id` 走 defaults 傳入（防重複帶入
 * 由 action 驗證，重複回 CONFLICT）。
 */
export function LoyaltyEntryDialog({
  open,
  onOpenChange,
  program,
  editing,
  defaults,
  onSaved,
}: LoyaltyEntryDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { createEntry, updateEntry } = useLoyaltyMutations();

  const [date, setDate] = useState(today());
  const [type, setType] = useState<LoyaltyEntryType>('flight');
  const [statusPoints, setStatusPoints] = useState('');
  const [awardMiles, setAwardMiles] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標/預填，為刻意的同步
    setDate(editing?.date ?? defaults?.date ?? today());
    setType(editing?.type ?? defaults?.type ?? 'other');
    setStatusPoints(editing ? String(editing.status_points) : '');
    setAwardMiles(editing ? String(editing.award_miles) : '');
    setNote(editing?.note ?? defaults?.note ?? '');
  }, [open, editing, defaults]);

  const pending = createEntry.isPending || updateEntry.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input: CreateLoyaltyEntryInput = {
      program,
      date,
      type,
      status_points: toInt(statusPoints),
      qualifying_miles: 0,
      award_miles: toInt(awardMiles),
      own_airline: editing?.own_airline ?? defaults?.own_airline ?? false,
      // 帶入來源標記：新增取預填、編輯沿用原值（避免更新把「已帶入」洗掉）
      flight_record_id: editing?.flight_record_id ?? defaults?.flight_record_id ?? null,
      note: note.trim(),
    };

    try {
      if (editing) {
        await updateEntry.mutateAsync({ id: editing.id, input });
      } else {
        await createEntry.mutateAsync(input);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t(editing ? 'loyalty.editEntry' : 'loyalty.addEntry')}
      description={t('loyalty.entryFormDescription')}
      footer={
        <Button form="loyalty-entry-form" type="submit" disabled={pending || !date}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      }
    >
      <form id="loyalty-entry-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('common.date')}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{t('loyalty.entryType')}</Label>
            <Select value={type} onValueChange={(v) => setType(v as LoyaltyEntryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOYALTY_ENTRY_TYPES.map((entryType) => (
                  <SelectItem key={entryType} value={entryType}>
                    {t(`loyalty.types.${entryType}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('loyalty.statusPoints')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={statusPoints}
              onChange={(e) => setStatusPoints(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>{t('loyalty.awardMiles')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={awardMiles}
              onChange={(e) => setAwardMiles(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('common.note')}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </div>
      </form>
    </ResponsiveFormSheet>
  );
}
