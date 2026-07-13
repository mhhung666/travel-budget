'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { useAirlines, useCollectionMutations } from '@/hooks/queries';
import { useToast } from '@/hooks/use-toast';
import type { CabinClass, DatePrecision, FlightRecordItem } from '@/types';
import type { CreateFlightRecordInput } from '@/lib/validation';
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
import { AirlineCombobox } from './AirlineCombobox';
import { AirportCombobox } from './AirportCombobox';
import { DatePrecisionInput, TripLinkSelect } from './RecordFormFields';

interface FlightRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null＝新增；有值＝編輯該筆。 */
  editing: FlightRecordItem | null;
}

const CABINS: CabinClass[] = ['economy', 'premium_economy', 'business', 'first'];
const NO_CABIN = 'none';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * 飛行紀錄補登/編輯表單。必填只有日期＋航空公司——歷史回填要低摩擦，
 * 其餘（航班號/航段/艙等/旅程連結）全部可留空。
 * 航班號輸入會自動帶出航空公司（前兩碼比對目錄）。
 */
export function FlightRecordDialog({ open, onOpenChange, editing }: FlightRecordDialogProps) {
  const t = useTranslations('collections');
  const { toast } = useToast();
  const { createFlight, updateFlight } = useCollectionMutations();
  const { data: airlines } = useAirlines(open);

  const [date, setDate] = useState(today());
  const [precision, setPrecision] = useState<DatePrecision>('day');
  const [airline, setAirline] = useState<string | null>(null);
  const [flightNo, setFlightNo] = useState('');
  const [fromAirport, setFromAirport] = useState<string | null>(null);
  const [toAirport, setToAirport] = useState<string | null>(null);
  const [cabin, setCabin] = useState<string>(NO_CABIN);
  const [tripId, setTripId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // 開啟時以編輯目標（或空白）初始化表單
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入編輯目標，為刻意的同步
    setDate(editing?.date ?? today());
    setPrecision(editing?.date_precision ?? 'day');
    setAirline(editing?.airline ?? null);
    setFlightNo(editing?.flight_no ?? '');
    setFromAirport(editing?.from_airport ?? null);
    setToAirport(editing?.to_airport ?? null);
    setCabin(editing?.cabin ?? NO_CABIN);
    setTripId(editing?.trip_id ?? null);
    setNote(editing?.note ?? '');
  }, [open, editing]);

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

  const pending = createFlight.isPending || updateFlight.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!airline || !date) return;

    const input: CreateFlightRecordInput = {
      trip_id: tripId,
      date,
      date_precision: precision,
      airline,
      flight_no: flightNo.trim(),
      from_airport: fromAirport,
      to_airport: toAirport,
      cabin: cabin === NO_CABIN ? null : (cabin as CabinClass),
      note: note.trim(),
    };

    try {
      if (editing) {
        await updateFlight.mutateAsync({ id: editing.id, input });
      } else {
        await createFlight.mutateAsync(input);
      }
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
            <TripLinkSelect value={tripId} onChange={setTripId} />
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
