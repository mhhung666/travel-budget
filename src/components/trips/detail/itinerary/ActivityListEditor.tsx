'use client';

import { Plus, Trash2, ArrowDownUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ActivityType } from '@/types';
import { sortActivities } from '@/lib/itineraryActivities';
import LocationAutocomplete from '@/components/location/LocationAutocomplete';
import { makeEmptyActivity, type ActivityDraft } from '@/lib/activityDraft';
export {
  makeEmptyActivity,
  dayActivitiesToDrafts,
  draftsToPayload,
  type ActivityDraft,
} from '@/lib/activityDraft';
import { TicketUploader } from '@/components/trips/detail/ReceiptAttachments';
import { ACTIVITY_TYPE_ORDER, ACTIVITY_TYPE_ICON } from './activityMeta';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * 單一活動的編輯卡（時間 / 標題 / 類型 / 地點 / 確認碼 / 備註 / 票券）。抽出共用，
 * 供 ActivityListEditor（整天多列）與 ActivityFormDialog（手機友善的單一新增）共用。
 * 給 onRemove 時右上角顯示刪除鈕（清單情境）；不給則隱藏（單一新增情境）。
 */
export function ActivityCard({
  tripId,
  activity,
  onChange,
  onRemove,
}: {
  tripId: string;
  activity: ActivityDraft;
  onChange: (fields: Partial<ActivityDraft>) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('itinerary.activities');
  const LegacyTransportIcon = ACTIVITY_TYPE_ICON.transport;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Input
          type="time"
          aria-label={t('time')}
          className="w-[7.5rem]"
          value={activity.time}
          onChange={(e) => onChange({ time: e.target.value })}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="time"
          aria-label={t('endTime')}
          className="w-[7.5rem]"
          value={activity.endTime}
          onChange={(e) => onChange({ endTime: e.target.value })}
        />
        <div className="flex-1" />
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onRemove}
            title={t('remove')}
            aria-label={t('remove')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="flex-1"
          placeholder={t('titlePlaceholder')}
          value={activity.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Select value={activity.type} onValueChange={(v) => onChange({ type: v as ActivityType })}>
          <SelectTrigger className="sm:w-40" aria-label={t('typeLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activity.type === 'transport' && (
              <SelectItem value="transport">
                <span className="flex items-center gap-2">
                  <LegacyTransportIcon className="h-3.5 w-3.5" />
                  {t('types.transport')}
                </span>
              </SelectItem>
            )}
            {ACTIVITY_TYPE_ORDER.map((type) => {
              const Icon = ACTIVITY_TYPE_ICON[type];
              return (
                <SelectItem key={type} value={type}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {t(`types.${type}`)}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <LocationAutocomplete
        value={activity.location}
        onChange={(loc) => onChange({ location: loc })}
        placeholder={t('locationPlaceholder')}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          className="sm:w-48"
          placeholder={t('confirmationCodePlaceholder')}
          value={activity.confirmationCode}
          onChange={(e) => onChange({ confirmationCode: e.target.value })}
        />
        <Input
          className="flex-1"
          placeholder={t('notePlaceholder')}
          value={activity.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{t('tickets')}</Label>
        <TicketUploader
          tripId={tripId}
          value={activity.attachments}
          onChange={(next) => onChange({ attachments: next })}
        />
      </div>
    </div>
  );
}

interface ActivityListEditorProps {
  /** 票券附件上傳/檢視需要 trip 識別碼。 */
  tripId: string;
  activities: ActivityDraft[];
  onChange: (next: ActivityDraft[]) => void;
}

export default function ActivityListEditor({
  tripId,
  activities,
  onChange,
}: ActivityListEditorProps) {
  const t = useTranslations('itinerary.activities');

  const patch = (key: string, fields: Partial<ActivityDraft>) =>
    onChange(activities.map((a) => (a.key === key ? { ...a, ...fields } : a)));
  const remove = (key: string) => onChange(activities.filter((a) => a.key !== key));
  const add = () => onChange([...activities, makeEmptyActivity()]);
  // 依時間手動排序（有時間者升冪、無時間殿後）。刻意不在輸入時自動排序，避免列在打字時跳動。
  const sortByTime = () => onChange(sortActivities(activities));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('heading')}</Label>
        <div className="flex gap-1.5">
          {activities.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={sortByTime}
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {t('sortByTime')}
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
            <Plus className="h-3.5 w-3.5" />
            {t('add')}
          </Button>
        </div>
      </div>

      {activities.length === 0 ? (
        <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <ActivityCard
              key={activity.key}
              tripId={tripId}
              activity={activity}
              onChange={(fields) => patch(activity.key, fields)}
              onRemove={() => remove(activity.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
