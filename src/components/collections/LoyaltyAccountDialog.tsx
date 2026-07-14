'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { PROGRAM_RULES, type LoyaltyProgram } from '@/constants/loyalty';
import { useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { LoyaltyAccountItem } from '@/types';
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

interface LoyaltyAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: LoyaltyProgram;
  /** null＝首次設定；有值＝編輯（等級/會員號/備註）。 */
  editing: LoyaltyAccountItem | null;
}

/**
 * 會籍帳戶設定表單：等級由使用者自行申報（app 不自動判級，見 PLAN-LOYALTY.md），
 * 會員號/備註選填。program 於 MVP 固定為國泰，Phase 2 起由外部選擇後傳入。
 */
export function LoyaltyAccountDialog({
  open,
  onOpenChange,
  program,
  editing,
}: LoyaltyAccountDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { upsertAccount } = useLoyaltyMutations();

  const tiers = PROGRAM_RULES[program].tiers;
  const [tier, setTier] = useState(tiers[0].key);
  const [memberNo, setMemberNo] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標，為刻意的同步
    setTier(editing?.current_tier ?? tiers[0].key);
    setMemberNo(editing?.member_no ?? '');
    setNote(editing?.note ?? '');
  }, [open, editing, tiers]);

  const pending = upsertAccount.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertAccount.mutateAsync({
        program,
        current_tier: tier,
        member_no: memberNo.trim(),
        note: note.trim(),
      });
      onOpenChange(false);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
    }
  };

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={t(editing ? 'loyalty.editAccount' : 'loyalty.setupAccount')}
      description={t('loyalty.accountFormDescription')}
      footer={
        <Button form="loyalty-account-form" type="submit" disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      }
    >
      <form id="loyalty-account-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('loyalty.program')}</Label>
          <Input value={t(`loyalty.programs.${program}`)} disabled readOnly />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('loyalty.tierLabel')}</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tierRule) => (
                  <SelectItem key={tierRule.key} value={tierRule.key}>
                    {t(`loyalty.tiers.${program}.${tierRule.key}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('loyalty.memberNo')}</Label>
            <Input
              value={memberNo}
              onChange={(e) => setMemberNo(e.target.value)}
              maxLength={30}
              className="font-mono"
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
