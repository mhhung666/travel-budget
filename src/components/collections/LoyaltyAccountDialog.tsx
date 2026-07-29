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
  const [tierStartedAt, setTierStartedAt] = useState('');
  const [tierExpiresAt, setTierExpiresAt] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [lifetimeNights, setLifetimeNights] = useState('');
  const [lifetimeSilverYears, setLifetimeSilverYears] = useState('');
  const [lifetimeGoldYears, setLifetimeGoldYears] = useState('');
  const [lifetimePlatinumYears, setLifetimePlatinumYears] = useState('');
  const [lifetimeDiamondYears, setLifetimeDiamondYears] = useState('');
  const [lifetimeSpendUsd, setLifetimeSpendUsd] = useState('');
  const [rolloverNights, setRolloverNights] = useState('');
  const [note, setNote] = useState('');

  // 卡籍效期欄只在續卡為「固定期制」的 program 顯示：哩程＋航段制（BR）恆有卡籍效期；
  // 積分制裡只有 renewalWindow: 'term2y'（CI）需要（CX 為 sameWindow，續會看曆年窗口本身）。
  const showExpiry =
    rules.kind === 'milesAndSegments' ||
    (rules.kind === 'points' && rules.renewalWindow === 'term2y');
  const isHotel = rules.kind === 'nights';

  const showProgramPicker = !editing && (availablePrograms?.length ?? 0) > 1;

  useEffect(() => {
    if (!open) return;
    const initialProgram = editing?.program ?? program;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標，為刻意的同步
    setSelectedProgram(initialProgram);
    setTier(editing?.current_tier ?? PROGRAM_RULES[initialProgram].tiers[0].key);
    setTierStartedAt(editing?.tier_started_at ?? '');
    setTierExpiresAt(editing?.tier_expires_at ?? '');
    setMemberNo(editing?.member_no ?? '');
    setLifetimeNights(editing ? String(editing.lifetime_nights) : '');
    setLifetimeSilverYears(editing ? String(editing.lifetime_silver_years) : '');
    setLifetimeGoldYears(editing ? String(editing.lifetime_gold_years) : '');
    setLifetimePlatinumYears(editing ? String(editing.lifetime_platinum_years) : '');
    setLifetimeDiamondYears(editing ? String(editing.lifetime_diamond_years) : '');
    setLifetimeSpendUsd(editing ? String(editing.lifetime_spend_usd) : '');
    setRolloverNights(editing ? String(editing.rollover_nights) : '');
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
        tier_started_at: isHotel ? null : tierStartedAt || null,
        tier_expires_at: showExpiry && tierExpiresAt ? tierExpiresAt : null,
        member_no: memberNo.trim(),
        lifetime_nights:
          selectedProgram === 'MB' || selectedProgram === 'HH' ? Number(lifetimeNights) || 0 : 0,
        lifetime_silver_years:
          selectedProgram === 'MB' ? Number.parseInt(lifetimeSilverYears, 10) || 0 : 0,
        lifetime_gold_years:
          selectedProgram === 'MB' ? Number.parseInt(lifetimeGoldYears, 10) || 0 : 0,
        lifetime_platinum_years:
          selectedProgram === 'MB' ? Number.parseInt(lifetimePlatinumYears, 10) || 0 : 0,
        lifetime_diamond_years:
          selectedProgram === 'HH' ? Number.parseInt(lifetimeDiamondYears, 10) || 0 : 0,
        lifetime_spend_usd: selectedProgram === 'HH' ? Number(lifetimeSpendUsd) || 0 : 0,
        rollover_nights: selectedProgram === 'IHG' ? Number(rolloverNights) || 0 : 0,
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

        {!isHotel && (
          <div className="space-y-2">
            <Label>{t('loyalty.tierStarted')}</Label>
            <Input
              type="date"
              value={tierStartedAt}
              onChange={(e) => setTierStartedAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('loyalty.tierStartedHint')}</p>
          </div>
        )}

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

        {selectedProgram === 'MB' && (
          <div className="space-y-3 rounded-xl border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t('loyalty.lifetimeProgress')}</p>
              <p className="text-xs text-muted-foreground">{t('loyalty.lifetimeProgressHint')}</p>
            </div>
            <div className="space-y-2">
              <Label>{t('loyalty.lifetimeNights')}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={lifetimeNights}
                onChange={(e) => setLifetimeNights(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['silver', lifetimeSilverYears, setLifetimeSilverYears],
                ['gold', lifetimeGoldYears, setLifetimeGoldYears],
                ['platinum', lifetimePlatinumYears, setLifetimePlatinumYears],
              ].map(([key, value, setter]) => (
                <div className="space-y-2" key={key as string}>
                  <Label>
                    {t('loyalty.lifetimeYears', {
                      tier: t(`loyalty.tiers.${selectedProgram}.${key}` as Parameters<typeof t>[0]),
                    })}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={value as string}
                    onChange={(e) =>
                      (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)
                    }
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedProgram === 'HH' && (
          <div className="space-y-3 rounded-xl border p-3">
            <p className="text-sm font-medium text-foreground">{t('loyalty.lifetimeProgress')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t('loyalty.lifetimeNights')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={lifetimeNights}
                  onChange={(e) => setLifetimeNights(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('loyalty.lifetimeDiamondYears')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={lifetimeDiamondYears}
                  onChange={(e) => setLifetimeDiamondYears(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('loyalty.lifetimeSpendUsd')}</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={lifetimeSpendUsd}
                  onChange={(e) => setLifetimeSpendUsd(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {selectedProgram === 'IHG' && (
          <div className="space-y-2">
            <Label>{t('loyalty.rolloverNights')}</Label>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={rolloverNights}
              onChange={(e) => setRolloverNights(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('loyalty.rolloverNightsHint')}</p>
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
