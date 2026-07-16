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
  /** 新增時可選的計畫清單（尚未設定者）；提供且 >1 時顯示計畫選單。編輯時忽略。 */
  availablePrograms?: LoyaltyProgram[];
}

/**
 * 會籍帳戶設定表單：等級由使用者自行申報（app 不自動判級，見 PLAN-LOYALTY.md），
 * 會員號/備註選填。新增時可挑選航空計畫（國泰／長榮…）；編輯時計畫固定。
 */
export function LoyaltyAccountDialog({
  open,
  onOpenChange,
  program,
  editing,
  availablePrograms,
}: LoyaltyAccountDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { upsertAccount } = useLoyaltyMutations();

  // 新增時可切換計畫；編輯時鎖定該帳戶的計畫
  const [selectedProgram, setSelectedProgram] = useState<LoyaltyProgram>(program);
  const rules = PROGRAM_RULES[selectedProgram];
  const tiers = rules.tiers;
  const [tier, setTier] = useState(tiers[0].key);
  const [tierExpiresAt, setTierExpiresAt] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [note, setNote] = useState('');

  // 卡籍效期欄只在續卡為「固定期制」的 program 顯示：哩程＋航段制（BR）恆有卡籍效期；
  // 積分制裡只有 renewalWindow: 'term2y'（CI）需要（CX 為 sameWindow，續會看曆年窗口本身）。
  const showExpiry = rules.kind === 'milesAndSegments' || rules.renewalWindow === 'term2y';

  const showProgramPicker = !editing && (availablePrograms?.length ?? 0) > 1;

  useEffect(() => {
    if (!open) return;
    const initialProgram = editing?.program ?? program;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標，為刻意的同步
    setSelectedProgram(initialProgram);
    setTier(editing?.current_tier ?? PROGRAM_RULES[initialProgram].tiers[0].key);
    setTierExpiresAt(editing?.tier_expires_at ?? '');
    setMemberNo(editing?.member_no ?? '');
    setNote(editing?.note ?? '');
  }, [open, editing, program]);

  const pending = upsertAccount.isPending;

  const handleProgramChange = (value: string) => {
    const next = value as LoyaltyProgram;
    setSelectedProgram(next);
    setTier(PROGRAM_RULES[next].tiers[0].key);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertAccount.mutateAsync({
        program: selectedProgram,
        current_tier: tier,
        tier_expires_at: showExpiry && tierExpiresAt ? tierExpiresAt : null,
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
          {showProgramPicker ? (
            <Select value={selectedProgram} onValueChange={handleProgramChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availablePrograms!.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`loyalty.programs.${p}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={t(`loyalty.programs.${selectedProgram}` as Parameters<typeof t>[0])}
              disabled
              readOnly
            />
          )}
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
                    {t(
                      `loyalty.tiers.${selectedProgram}.${tierRule.key}` as Parameters<typeof t>[0]
                    )}
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

        {showExpiry && (
          <div className="space-y-2">
            <Label>{t('loyalty.tierExpires')}</Label>
            <Input
              type="date"
              value={tierExpiresAt}
              onChange={(e) => setTierExpiresAt(e.target.value)}
            />
          </div>
        )}

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
