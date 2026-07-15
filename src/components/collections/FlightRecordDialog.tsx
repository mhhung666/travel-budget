'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import {
  useAirlines,
  useAirports,
  useCollectionMutations,
  useLoyalty,
  useLoyaltyMutations,
} from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import { CX_AWARD_MILES_PER_SP, PROGRAM_RULES } from '@/constants/loyalty';
import { estimateCxStatusPoints, KM_TO_MI } from '@/lib/loyalty';
import { haversineKm } from '@/lib/geo';
import type { CabinClass, DatePrecision, FlightRecordItem } from '@/types';
import type { CreateFlightRecordInput } from '@/lib/validation';
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
import { AirlineCombobox } from './AirlineCombobox';
import { AirportCombobox } from './AirportCombobox';
import { DatePrecisionInput, LockedTripField, TripLinkSelect } from './RecordFormFields';

interface FlightRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null＝新增；有值＝編輯該筆。 */
  editing: FlightRecordItem | null;
  /** 新增時的預填值（行程「一鍵帶入」用；編輯時忽略）。 */
  defaults?: Partial<CreateFlightRecordInput> | null;
  /**
   * 鎖定的連結旅程（行程一鍵帶入用）：帶入時旅程即當下旅程，改以唯讀欄位呈現、
   * 不給下拉改選；只在新增時生效（編輯忽略）。
   */
  lockedTrip?: { id: string; name: string } | null;
  /** 儲存成功後回呼（帶入情境顯示 toast 用）。 */
  onSaved?: () => void;
}

const CABINS: CabinClass[] = ['economy', 'premium_economy', 'business', 'first'];
const NO_CABIN = 'none';

const today = () => new Date().toISOString().slice(0, 10);

/** 手抄數字的寬容解析：空字串/非數字視為 0（積分與里數皆可為負，如兌換/沖銷）。 */
const toInt = (raw: string): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * 飛行紀錄補登/編輯表單。必填只有日期＋航空公司——歷史回填要低摩擦，
 * 其餘（航班號/航段/艙等/旅程連結）全部可留空。
 * 航班號輸入會自動帶出航空公司（前兩碼比對目錄）。
 *
 * 選填「累積會籍」：選定航空公司＝使用者已設定的會籍計畫（IATA 即 program 代碼：
 * CX／BR）時，底部出現 checkbox，勾選後在存航班的同時記一筆 LoyaltyEntry
 * （flight_record_id 指向新航班）。CX 依表單的機場＋艙等即時給積分區間試算。
 */
export function FlightRecordDialog({
  open,
  onOpenChange,
  editing,
  defaults,
  lockedTrip,
  onSaved,
}: FlightRecordDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { createFlight, updateFlight } = useCollectionMutations();
  const { createEntry } = useLoyaltyMutations();
  const { data: airlines } = useAirlines(open);
  const { data: loyalty } = useLoyalty(open);

  const [date, setDate] = useState(today());
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [airline, setAirline] = useState<string | null>(null);
  const [flightNo, setFlightNo] = useState('');
  const [fromAirport, setFromAirport] = useState<string | null>(null);
  const [toAirport, setToAirport] = useState<string | null>(null);
  const [cabin, setCabin] = useState<string>(NO_CABIN);
  const [tripId, setTripId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // 累積會籍（選填）
  const [accrue, setAccrue] = useState(false);
  const [statusPoints, setStatusPoints] = useState('');
  const [qualifyingMiles, setQualifyingMiles] = useState('');
  const [awardMiles, setAwardMiles] = useState('');
  const [ownAirline, setOwnAirline] = useState(false);

  // 帶入時鎖定旅程＝當下旅程（唯讀）；編輯情境不套用鎖定。
  const locked = editing ? null : (lockedTrip ?? null);

  // 選定航空公司對應的會籍帳戶（IATA 代碼即 program 代碼）；沒帳戶＝不提供累積。
  const matchedAccount = useMemo(
    () => loyalty?.accounts.find((a) => a.program === airline) ?? null,
    [loyalty, airline]
  );
  const program = matchedAccount?.program ?? null;
  const loyaltyKind = program ? PROGRAM_RULES[program].kind : null;
  // 編輯情境：此航班已累積過就不再顯示（防重複，比照 action 的 CONFLICT 去重）。
  const alreadyAccrued = useMemo(
    () =>
      editing ? (loyalty?.entries ?? []).some((e) => e.flight_record_id === editing.id) : false,
    [loyalty, editing]
  );
  const canAccrue = program !== null && !alreadyAccrued;

  // CX 積分區間試算（PLAN-LOYALTY §8）：機場座標＋艙等現算，隨表單即時更新。
  const { data: airports } = useAirports(open && program === 'CX');
  const spEstimate = useMemo(() => {
    if (program !== 'CX' || !airports || !fromAirport || !toAirport || cabin === NO_CABIN) {
      return null;
    }
    const from = airports.find((a) => a.iata === fromAirport);
    const to = airports.find((a) => a.iata === toAirport);
    if (!from || !to) return null;
    const distanceMi = haversineKm([from.lat, from.lon], [to.lat, to.lon]) * KM_TO_MI;
    const { min, max } = estimateCxStatusPoints(
      distanceMi,
      cabin as CabinClass,
      from.country ?? '',
      to.country ?? ''
    );
    return { min, max };
  }, [program, airports, fromAirport, toAirport, cabin]);

  // 開啟時初始化表單：編輯＝帶入該筆；新增＝套用預填（行程帶入）或空白
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標/預填，為刻意的同步
    setDate(editing?.date ?? defaults?.date ?? today());
    setPrecision(editing?.date_precision ?? defaults?.date_precision ?? 'day');
    setAirline(editing?.airline ?? defaults?.airline ?? null);
    setFlightNo(editing?.flight_no ?? defaults?.flight_no ?? '');
    setFromAirport(editing?.from_airport ?? defaults?.from_airport ?? null);
    setToAirport(editing?.to_airport ?? defaults?.to_airport ?? null);
    setCabin(editing?.cabin ?? defaults?.cabin ?? NO_CABIN);
    setTripId(locked?.id ?? editing?.trip_id ?? defaults?.trip_id ?? null);
    setNote(editing?.note ?? defaults?.note ?? '');
    // 累積區塊每次開啟一律重置（opt-in），避免沿用上一筆的數字
    setAccrue(false);
    setStatusPoints('');
    setQualifyingMiles('');
    setAwardMiles('');
    setOwnAirline(false);
  }, [open, editing, defaults, locked]);

  const handleFlightNo = (raw: string) => {
    const value = raw.toUpperCase();
    setFlightNo(value);
    // 航班號前兩碼＝IATA 航空代碼：未選航空時自動帶出（限目錄內的代碼）
    if (!airline && airlines) {
      const prefix = value.slice(0, 2);
      if (
        /^[A-Z0-9]{2}$/.test(prefix) &&
        value.length > 2 &&
        airlines.some((a) => a.iata === prefix)
      ) {
        setAirline(prefix);
      }
    }
  };

  const pending = createFlight.isPending || updateFlight.isPending || createEntry.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!airline || !date) return;

    const input: CreateFlightRecordInput = {
      trip_id: tripId,
      // 帶入來源標記：新增取預填、編輯沿用原值（避免更新把「已帶入」洗掉）。
      // 鎖定旅程時不可改選 → 一律保留來源活動；否則使用者改掉連結旅程即清除。
      source_activity_id: locked
        ? (defaults?.source_activity_id ?? null)
        : tripId === (editing?.trip_id ?? defaults?.trip_id ?? null)
          ? (editing?.source_activity_id ?? defaults?.source_activity_id ?? null)
          : null,
      date,
      date_precision: precision,
      airline,
      flight_no: flightNo.trim(),
      from_airport: fromAirport,
      to_airport: toAirport,
      cabin: cabin === NO_CABIN ? null : (cabin as CabinClass),
      note: note.trim(),
    };

    let saved: FlightRecordItem;
    try {
      saved = editing
        ? await updateFlight.mutateAsync({ id: editing.id, input })
        : await createFlight.mutateAsync(input);
    } catch (error) {
      const key = error instanceof Error ? error.message : 'INTERNAL_ERROR';
      toast({ title: t(`errors.${key}` as Parameters<typeof t>[0]), variant: 'destructive' });
      return;
    }

    // 選填累積會籍：航班已存檔，累積失敗只提示、不擋關閉（重試不再重存航班，
    // 避免重複紀錄）。帳戶存在＋尚未累積過才會走到這裡。
    if (accrue && program && canAccrue) {
      try {
        await createEntry.mutateAsync({
          program,
          date,
          type: 'flight',
          status_points: loyaltyKind === 'points' ? toInt(statusPoints) : 0,
          qualifying_miles: loyaltyKind === 'milesAndSegments' ? toInt(qualifyingMiles) : 0,
          award_miles: toInt(awardMiles),
          own_airline: loyaltyKind === 'milesAndSegments' ? ownAirline : false,
          flight_record_id: saved.id,
          note: flightNo.trim(),
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
      title={editing ? t('flights.editFlight') : t('flights.addFlight')}
      description={t('flights.formDescription')}
      footer={
        <Button form="flight-record-form" type="submit" disabled={pending || !airline || !date}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      }
    >
      <form id="flight-record-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>{t('common.date')}</Label>
          <DatePrecisionInput
            date={date}
            precision={precision}
            onDateChange={setDate}
            onPrecisionChange={setPrecision}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('flights.flightNo')}</Label>
            <Input
              value={flightNo}
              onChange={(e) => handleFlightNo(e.target.value)}
              placeholder="BR182"
              maxLength={8}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t('flights.airline')} <span className="text-destructive">*</span>
            </Label>
            <AirlineCombobox value={airline} onChange={setAirline} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('flights.from')}</Label>
            <AirportCombobox
              value={fromAirport}
              onChange={setFromAirport}
              placeholder={t('flights.fromPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('flights.to')}</Label>
            <AirportCombobox
              value={toAirport}
              onChange={setToAirport}
              placeholder={t('flights.toPlaceholder')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('flights.cabin')}</Label>
            <Select value={cabin} onValueChange={setCabin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CABIN}>{t('common.unset')}</SelectItem>
                {CABINS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`flights.cabins.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {/* 累積會籍（選填）：選定航空對應到已設定的會籍計畫時才出現 */}
        {canAccrue && program && (
          <div className="space-y-3 rounded-lg border p-3">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={accrue}
                onCheckedChange={(v) => setAccrue(v === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {t('flights.accrueLoyalty', { program: t(`loyalty.programs.${program}`) })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('flights.accrueLoyaltyHint')}
                </span>
              </span>
            </label>

            {accrue && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>
                      {t(
                        loyaltyKind === 'points'
                          ? 'loyalty.statusPoints'
                          : 'loyalty.qualifyingMiles'
                      )}
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={loyaltyKind === 'points' ? statusPoints : qualifyingMiles}
                      onChange={(e) =>
                        loyaltyKind === 'points'
                          ? setStatusPoints(e.target.value)
                          : setQualifyingMiles(e.target.value)
                      }
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

                {loyaltyKind === 'points' && spEstimate && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                    <span className="text-xs text-muted-foreground">
                      {t('loyalty.estimatePrefill')}
                    </span>
                    {[...new Set([spEstimate.min, spEstimate.max])].map((sp) => (
                      <Button
                        key={sp}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2.5 font-mono"
                        onClick={() => {
                          setStatusPoints(String(sp));
                          setAwardMiles(String(sp * CX_AWARD_MILES_PER_SP));
                        }}
                      >
                        {sp}
                      </Button>
                    ))}
                  </div>
                )}

                {loyaltyKind === 'milesAndSegments' && (
                  <label className="flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={ownAirline}
                      onCheckedChange={(v) => setOwnAirline(v === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {t('loyalty.ownAirlineFlight')}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t('loyalty.ownAirlineFlightHint')}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            )}
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
