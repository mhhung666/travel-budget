'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Star } from 'lucide-react';

import { useCollectionMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { toLocalDateInputValue } from '@/lib/dateInput';
import type { DatePrecision, StayRecordItem } from '@/types';
import type { CreateStayRecordInput } from '@/lib/validation';
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

  const [checkIn, setCheckIn] = useState(today());
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [nights, setNights] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [hotelName, setHotelName] = useState('');
  const [stars, setStars] = useState<string>(NO_STARS);
  const [city, setCity] = useState('');
  const [tripId, setTripId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // 帶入時鎖定旅程＝當下旅程（唯讀）；編輯情境不套用鎖定。
  const locked = editing ? null : (lockedTrip ?? null);

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
  }, [open, editing, defaults, locked]);

  const pending = createStay.isPending || updateStay.isPending;
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

    try {
      if (editing) {
        await updateStay.mutateAsync({ id: editing.id, input });
      } else {
        await createStay.mutateAsync(input);
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
