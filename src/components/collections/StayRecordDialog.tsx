'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Star } from 'lucide-react';

import { useCollectionMutations, useLoyalty, useLoyaltyMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { toLocalDateInputValue } from '@/lib/dateInput';
import { getHotelBrand } from '@/constants/hotelBrands';
import type { DatePrecision, StayRecordItem } from '@/types';
import type { CreateStayRecordInput } from '@/lib/validation';
import { ResponsiveFormSheet } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { BrandCombobox } from './BrandCombobox';
import { DatePrecisionInput, LockedTripField, TripLinkSelect } from './RecordFormFields';

interface StayRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null＝新增；有值＝編輯該筆。 */
  editing: StayRecordItem | null;
  /** 新增時的預填值（行程「一鍵帶入」用；編輯時忽略）。 */
  defaults?: Partial<CreateStayRecordInput> | null;
  /**
   * 鎖定的連結旅程（行程一鍵帶入用）：帶入時旅程即當下旅程，改以唯讀欄位呈現、
   * 不給下拉改選；只在新增時生效（編輯忽略）。
   */
  lockedTrip?: { id: string; name: string } | null;
  /** 儲存成功後回呼（帶入情境顯示 toast 用）。 */
  onSaved?: () => void;
}

const NO_STARS = 'none';

const today = () => toLocalDateInputValue();

/**
 * 住宿紀錄補登/編輯表單。必填只有入住日＋飯店名稱；品牌選不到就留空
 * （獨立旅宿——品牌目錄缺漏不擋輸入），星級為自報、可不填。
 */
export function StayRecordDialog({
  open,
  onOpenChange,
  editing,
  defaults,
  lockedTrip,
  onSaved,
}: StayRecordDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { createStay, updateStay } = useCollectionMutations();
  const { createEntry } = useLoyaltyMutations();
  const { data: loyalty } = useLoyalty(open);

  const [checkIn, setCheckIn] = useState(today());
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [nights, setNights] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [hotelName, setHotelName] = useState('');
  const [stars, setStars] = useState<string>(NO_STARS);
  const [city, setCity] = useState('');
  const [tripId, setTripId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [accrue, setAccrue] = useState(false);
  const [qualifyingNights, setQualifyingNights] = useState('');
  const [qualifyingSpendUsd, setQualifyingSpendUsd] = useState('');
  const [rewardPoints, setRewardPoints] = useState('');

  // 帶入時鎖定旅程＝當下旅程（唯讀）；編輯情境不套用鎖定。
  const locked = editing ? null : (lockedTrip ?? null);
  const hasMarriottAccount = loyalty?.accounts.some((account) => account.program === 'MB') ?? false;
  const isMarriottBrand = getHotelBrand(brand)?.group === 'marriott';
  const alreadyAccrued = editing
    ? (loyalty?.entries ?? []).some((entry) => entry.stay_record_id === editing.id)
    : false;
  const stayNights = Number.parseInt(nights, 10);
  const creditsByCheckInYear =
    brand === 'city-express' ||
    brand === 'protea' ||
    brand === 'four-points-flex' ||
    brand === 'series-by-marriott' ||
    brand === 'marriott-executive';
  const crossesCalendarYear = (() => {
    if (creditsByCheckInYear || !checkIn || !Number.isFinite(stayNights) || stayNights <= 1) {
      return false;
    }
    const lastNight = new Date(`${checkIn}T00:00:00Z`);
    lastNight.setUTCDate(lastNight.getUTCDate() + stayNights - 1);
    return lastNight.getUTCFullYear() !== Number(checkIn.slice(0, 4));
  })();
  const canAccrueBase = hasMarriottAccount && isMarriottBrand && !alreadyAccrued;
  const canAccrue = canAccrueBase && !crossesCalendarYear;

  const suggestedQualifyingNights = (() => {
    if (!Number.isFinite(stayNights) || stayNights <= 0) return 0;
    if (brand === 'studiores') return 0;
    if (
      brand === 'city-express' ||
      brand === 'protea' ||
      brand === 'four-points-flex' ||
      brand === 'series-by-marriott'
    ) {
      return stayNights * 0.5;
    }
    return stayNights;
  })();

  // 開啟時初始化表單：編輯＝帶入該筆；新增＝套用預填（行程帶入）或空白
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標/預填，為刻意的同步
    setCheckIn(editing?.check_in ?? defaults?.check_in ?? today());
    setPrecision(editing?.date_precision ?? defaults?.date_precision ?? 'day');
    setNights(
      editing?.nights != null
        ? String(editing.nights)
        : defaults?.nights != null
          ? String(defaults.nights)
          : ''
    );
    setBrand(editing?.brand ?? defaults?.brand ?? null);
    setHotelName(editing?.hotel_name ?? defaults?.hotel_name ?? '');
    setStars(editing?.stars != null ? String(editing.stars) : NO_STARS);
    setCity(editing?.city ?? defaults?.city ?? '');
    setTripId(locked?.id ?? editing?.trip_id ?? defaults?.trip_id ?? null);
    setNote(editing?.note ?? defaults?.note ?? '');
    setAccrue(false);
    setQualifyingNights('');
    setQualifyingSpendUsd('');
    setRewardPoints('');
  }, [open, editing, defaults, locked]);

  const pending = createStay.isPending || updateStay.isPending || createEntry.isPending;
  const canSubmit = Boolean(checkIn && hotelName.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const parsedNights = Number.parseInt(nights, 10);
    const input: CreateStayRecordInput = {
      trip_id: tripId,
      // 帶入來源標記：新增取預填、編輯沿用原值；鎖定旅程時一律保留、否則改掉連結旅程即清除（同 FlightRecordDialog）。
      source_activity_id: locked
        ? (defaults?.source_activity_id ?? null)
        : tripId === (editing?.trip_id ?? defaults?.trip_id ?? null)
          ? (editing?.source_activity_id ?? defaults?.source_activity_id ?? null)
          : null,
      check_in: checkIn,
      date_precision: precision,
      nights: Number.isFinite(parsedNights) && parsedNights > 0 ? parsedNights : null,
      brand,
      hotel_name: hotelName.trim(),
      stars: stars === NO_STARS ? null : Number(stars),
      city: city.trim(),
      note: note.trim(),
    };

    let saved: StayRecordItem;
    try {
      saved = editing
        ? await updateStay.mutateAsync({ id: editing.id, input })
        : await createStay.mutateAsync(input);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
      return;
    }

    if (accrue && canAccrue) {
      try {
        await createEntry.mutateAsync({
          program: 'MB',
          date: checkIn,
          type: 'stay',
          status_points: 0,
          qualifying_miles: 0,
          award_miles: 0,
          qualifying_nights: Number(qualifyingNights) || 0,
          qualifying_spend_usd: Number(qualifyingSpendUsd) || 0,
          reward_points: Number.parseInt(rewardPoints, 10) || 0,
          own_airline: false,
          flight_record_id: null,
          stay_record_id: saved.id,
          note: hotelName.trim(),
        });
      } catch (error) {
        const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
        toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
      }
    }
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <ResponsiveFormSheet
      open={open}
      onOpenChange={(next) => !pending && onOpenChange(next)}
      title={editing ? t('stays.editStay') : t('stays.addStay')}
      description={t('stays.formDescription')}
      footer={
        <Button form="stay-record-form" type="submit" disabled={pending || !canSubmit}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      }
    >
      <form id="stay-record-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>
            {t('stays.hotelName')} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={hotelName}
            onChange={(e) => setHotelName(e.target.value)}
            placeholder={t('stays.hotelNamePlaceholder')}
            maxLength={120}
            required
          />
        </div>

        <div className="space-y-2">
          <Label>{t('stays.brand')}</Label>
          <BrandCombobox value={brand} onChange={setBrand} />
          <p className="text-xs text-muted-foreground">{t('stays.brandHint')}</p>
        </div>

        <div className="space-y-2">
          <Label>{t('stays.checkIn')}</Label>
          <DatePrecisionInput
            date={checkIn}
            precision={precision}
            onDateChange={setCheckIn}
            onPrecisionChange={setPrecision}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('stays.nights')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={nights}
              onChange={(e) => setNights(e.target.value)}
              placeholder={t('common.unset')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('stays.stars')}</Label>
            <Select value={stars} onValueChange={setStars}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_STARS}>{t('common.unset')}</SelectItem>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="flex items-center gap-1">
                      {n}
                      <Star className="h-3 w-3 fill-current" />
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('stays.city')}</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label>{t('common.linkTrip')}</Label>
            {locked ? (
              <LockedTripField name={locked.name} />
            ) : (
              <TripLinkSelect value={tripId} onChange={setTripId} />
            )}
          </div>
        </div>

        {canAccrue && (
          <div className="space-y-3 rounded-xl border p-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={accrue}
                onCheckedChange={(value) => {
                  const checked = value === true;
                  setAccrue(checked);
                  if (checked && !qualifyingNights) {
                    setQualifyingNights(String(suggestedQualifyingNights));
                  }
                }}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {t('stays.accrueMarriott')}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('stays.accrueMarriottHint')}
                </span>
              </span>
            </label>
            {accrue && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{t('loyalty.qualifyingNights')}</Label>
                  <Input
                    type="number"
                    step={0.5}
                    value={qualifyingNights}
                    onChange={(e) => setQualifyingNights(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('loyalty.qualifyingSpendUsd')}</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={qualifyingSpendUsd}
                    onChange={(e) => setQualifyingSpendUsd(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('loyalty.rewardPoints')}</Label>
                  <Input
                    type="number"
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {canAccrueBase && crossesCalendarYear && (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {t('stays.marriottCrossYearHint')}
          </p>
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
