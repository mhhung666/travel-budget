'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ArrowRight, HandCoins } from 'lucide-react';
import type { RecordPaymentInput } from '@/lib/validation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export interface PaymentMemberOption {
  id: string;
  name: string;
}

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  members: PaymentMemberOption[];
  /** 由某筆建議轉帳帶入的預填值；null 代表空白（自行登記任意付款）。 */
  initial: { fromId: string; toId: string; amount: number } | null;
  onSubmit: (input: RecordPaymentInput) => Promise<void>;
}

/**
 * 登記一筆還款（標記「已付清」）。付款人／收款人以下拉選單選擇（預填自點擊的
 * 建議轉帳，但可調整以支援部分結清或計畫外的還款）；金額為基準幣 TWD。
 */
export default function RecordPaymentDialog({
  open,
  onClose,
  members,
  initial,
  onSubmit,
}: RecordPaymentDialogProps) {
  const t = useTranslations('settlement');
  const tCommon = useTranslations('common');

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入預填，為刻意的同步
    setFromId(initial?.fromId ?? '');
    setToId(initial?.toId ?? '');
    setAmount(initial && initial.amount > 0 ? String(initial.amount) : '');
    setNote('');
    setError('');
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!fromId || !toId) {
      setError(t('errorSelectMembers'));
      return;
    }
    if (fromId === toId) {
      setError(t('errorSamePerson'));
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError(t('errorAmount'));
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await onSubmit({
        from_id: fromId,
        to_id: toId,
        amount: amt,
        note: note.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && !isSaving && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            {t('recordPayment')}
          </DialogTitle>
          <DialogDescription>{t('recordPaymentDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{tCommon('errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>{t('payer')}</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectMember')} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="mb-3 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-2">
              <Label>{t('payee')}</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectMember')} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-amount">{t('amountLabel')}</Label>
            <Input
              id="payment-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-note">{t('noteLabel')}</Label>
            <Input
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
              maxLength={200}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
