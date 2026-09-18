'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Eye, Pencil, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ItineraryDay } from '@/types';
import LocationAutocomplete, { LocationOption } from '@/components/location/LocationAutocomplete';
import MarkdownRenderer from './MarkdownRenderer';
import { ItineraryDayDate } from './ItineraryDayDate';
import { ItineraryDayTargetField } from './ItineraryDayTargetField';
import type { ItineraryDayTargetInput } from '@/lib/validation';
import { ActionQueryError } from '@/lib/actionQuery';
import {
  dayNumberForDate,
  firstUnusedDate,
  firstUnusedDayNumber,
  isDateWithinTrip,
  toDateOnly,
} from '@/lib/itineraryDayTarget';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface ItineraryDayDialogProps {
  mode: 'add' | 'edit';
  open: boolean;
  onClose: () => void;
  /**
   * 只送整天欄位（標題/地點/Markdown）；activities 不在此編輯（走活動列的就地編輯），不傳＝不動。
   * 新增模式一併帶 target（日期或第幾天），由 server 重算 dayNumber。
   */
  onSubmit: (data: {
    title: string;
    content: string;
    location: LocationOption | null;
    target?: ItineraryDayTargetInput;
  }) => Promise<void>;
  day?: ItineraryDay | null;
  dayNumber?: number;
  /** 編輯模式：由旅程開始日與 day number 推算，不由表單編輯。 */
  date?: string | null;
  outsideTripRange?: boolean;
  /** 新增模式的日期基準；沒有開始日時退回「第幾天」欄位。 */
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  /** 已建立的 dayNumber，用來擋重複並標示快捷選項。 */
  usedDayNumbers?: number[];
  /** 選到已建立的一天時跳去看當天行程（有草稿時由此處先確認放棄）。 */
  onViewExistingDay?: (dayNumber: number) => void;
  onOpenTripSettings?: () => void;
}

export default function ItineraryDayDialog({
  mode,
  open,
  onClose,
  onSubmit,
  day,
  dayNumber,
  date,
  outsideTripRange,
  tripStartDate,
  tripEndDate,
  usedDayNumbers = [],
  onViewExistingDay,
  onOpenTripSettings,
}: ItineraryDayDialogProps) {
  const tItinerary = useTranslations('itinerary');
  const tTarget = useTranslations('itinerary.dayTarget');
  const tCommon = useTranslations('common');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [location, setLocation] = useState<LocationOption | null>(null);
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
  const [loading, setLoading] = useState(false);
  // 新增目標：日期為唯一輸入，Day N 由它推算；沒有開始日時改用 targetDayNumber。
  const [targetDate, setTargetDate] = useState('');
  const [targetDayNumber, setTargetDayNumber] = useState(1);
  // server 回報的失敗（同日已存在、旅程改期…）：就地顯示在日期欄位，草稿留著。
  const [submitError, setSubmitError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startDate = toDateOnly(tripStartDate);
  const endDate = toDateOnly(tripEndDate);
  const targetMode: 'date' | 'dayNumber' = startDate ? 'date' : 'dayNumber';
  const usedSet = useMemo(() => new Set(usedDayNumbers), [usedDayNumbers]);
  const resolvedDayNumber =
    targetMode === 'date'
      ? targetDate && startDate
        ? dayNumberForDate(startDate, targetDate)
        : null
      : Number.isInteger(targetDayNumber) && targetDayNumber >= 1
        ? targetDayNumber
        : null;

  // 送出前的本地檢查；server 仍會重驗（前端預覽不可信）。
  const localTargetError =
    mode !== 'add'
      ? null
      : resolvedDayNumber === null
        ? tTarget('errors.required')
        : usedSet.has(resolvedDayNumber)
          ? tTarget('errors.dayExists')
          : targetMode === 'date' && !isDateWithinTrip(targetDate, startDate, endDate)
            ? tTarget('errors.outsideTrip')
            : null;
  const targetError = submitError ?? localTargetError;

  const autoResize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(200, textarea.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && day) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 開啟對話框時帶入當日資料，為刻意的同步
        setTitle(day.title);
        setContent(day.content);
        setLocation(
          day.location
            ? {
                name: day.location.name,
                names: day.location.names,
                display_name: day.location.display_name,
                lat: day.location.lat,
                lon: day.location.lon,
                country: day.location.country,
                country_code: day.location.country_code,
              }
            : null
        );
      } else {
        setTitle('');
        setContent('');
        setLocation(null);
        // 預設＝旅程範圍內最早尚未建立的一天；全滿或無開始日時退回可用天數。
        setTargetDate(firstUnusedDate(tripStartDate, tripEndDate, usedDayNumbers) ?? '');
        setTargetDayNumber(firstUnusedDayNumber(usedDayNumbers));
      }
      setSubmitError(null);
      setViewMode('write');
      requestAnimationFrame(autoResize);
    }
    // usedDayNumbers/旅程日期只在開啟當下取樣，之後由使用者控制，不隨背景刷新蓋掉選擇。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, day, autoResize]);

  useEffect(() => {
    if (viewMode === 'write') {
      requestAnimationFrame(autoResize);
    }
  }, [viewMode, autoResize]);

  // 離開表單會丟掉未儲存的草稿，先確認過再跳去看那天的行程。
  const handleViewExistingDay = onViewExistingDay
    ? (dayNumber: number) => {
        const hasDraft = title.trim() !== '' || content.trim() !== '' || location !== null;
        if (hasDraft && !window.confirm(tTarget('discardDraftConfirm'))) return;
        onViewExistingDay(dayNumber);
      }
    : undefined;

  const buildTarget = (): ItineraryDayTargetInput | undefined => {
    if (mode !== 'add') return undefined;
    if (targetMode === 'date') {
      return { date: targetDate, expected_start_date: startDate!, expected_end_date: endDate };
    }
    return {
      day_number: targetDayNumber,
      expected_start_date: null,
      expected_end_date: endDate,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || localTargetError) return;

    setLoading(true);
    setSubmitError(null);
    try {
      await onSubmit({
        title: title.trim(),
        content,
        location,
        ...(mode === 'add' ? { target: buildTarget() } : {}),
      });
      onClose();
    } catch (error) {
      // 日期相關失敗留在表單裡改；其餘（網路、權限…）由 parent 的 toast 負責。
      const code = error instanceof ActionQueryError ? error.code : undefined;
      if (code === 'DAY_ALREADY_EXISTS') setSubmitError(tTarget('errors.dayExists'));
      else if (code === 'DATE_OUTSIDE_TRIP') setSubmitError(tTarget('errors.outsideTrip'));
      else if (code === 'TRIP_DATES_CHANGED') setSubmitError(tTarget('errors.datesChanged'));
      else if (code === 'TRIP_START_DATE_REQUIRED') setSubmitError(tTarget('errors.startRequired'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add'
              ? tItinerary('addDay')
              : dayNumber
                ? tItinerary('editDayN', { dayNumber })
                : tItinerary('editDay')}
          </DialogTitle>
          {mode === 'edit' && <ItineraryDayDate date={date} outsideTripRange={outsideTripRange} />}
        </DialogHeader>

        <form
          id="itinerary-day-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto p-1"
        >
          {mode === 'add' && (
            <ItineraryDayTargetField
              mode={targetMode}
              tripStartDate={startDate}
              tripEndDate={endDate}
              usedDayNumbers={usedSet}
              date={targetDate}
              dayNumber={targetDayNumber}
              onDateChange={(value) => {
                setTargetDate(value);
                setSubmitError(null);
              }}
              onDayNumberChange={(value) => {
                setTargetDayNumber(value);
                setSubmitError(null);
              }}
              error={targetError}
              onViewExistingDay={handleViewExistingDay}
              onOpenTripSettings={onOpenTripSettings}
              disabled={loading}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="day-title">{tItinerary('dayTitle')}</Label>
            <Input
              id="day-title"
              placeholder={tItinerary('dayTitlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <LocationAutocomplete
              value={location}
              onChange={setLocation}
              label={tItinerary('dayLocation')}
              placeholder={tItinerary('dayLocationPlaceholder')}
              helperText={tItinerary('dayLocationHelp')}
            />
          </div>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'write' | 'preview')}>
            <div className="flex justify-end mb-2">
              <TabsList className="grid w-[200px] grid-cols-2">
                <TabsTrigger value="write" className="gap-2">
                  <Pencil size={14} />
                  {tItinerary('write')}
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye size={14} />
                  {tItinerary('preview')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="write" className="m-0 border rounded-md">
              <Textarea
                ref={textareaRef}
                className="min-h-[200px] w-full resize-none border-0 focus-visible:ring-0 rounded-md p-4"
                placeholder={tItinerary('dayContentPlaceholder')}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  autoResize();
                }}
              />
            </TabsContent>
            <TabsContent
              value="preview"
              className="m-0 border rounded-md p-4 min-h-[200px] bg-muted/20"
            >
              {content ? (
                <MarkdownRenderer content={content} />
              ) : (
                <div className="min-h-[200px] flex items-center justify-center text-muted-foreground italic">
                  {tItinerary('dayContentPlaceholder')}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </form>

        <Separator />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            form="itinerary-day-form"
            disabled={loading || !title.trim() || !!localTargetError}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'add'
              ? loading
                ? tTarget('submitting')
                : tTarget('submit')
              : tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
