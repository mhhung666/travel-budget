'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Activity, ActivityType } from '@/types';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import LocationAutocomplete, { type LocationOption } from '@/components/location/LocationAutocomplete';
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

/** 編輯器內的活動草稿。time/endTime 以空字串表示未指定（submit 時轉成 null）；key 為前端 render key。 */
export interface ActivityDraft {
  key: string;
  time: string;
  endTime: string;
  title: string;
  type: ActivityType;
  location: LocationOption | null;
  note: string;
  confirmationCode: string;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `act-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeEmptyActivity(): ActivityDraft {
  return {
    key: uid(),
    time: '',
    endTime: '',
    title: '',
    type: 'other',
    location: null,
    note: '',
    confirmationCode: '',
  };
}

/** 把已儲存的活動 DTO 轉成編輯器草稿（開啟對話框時用）。 */
export function dayActivitiesToDrafts(activities: Activity[]): ActivityDraft[] {
  return activities.map((a) => ({
    key: a.id || uid(),
    time: a.time ?? '',
    endTime: a.end_time ?? '',
    title: a.title,
    type: a.type,
    location: a.location
      ? {
          name: a.location.name,
          names: a.location.names,
          display_name: a.location.display_name,
          lat: a.location.lat,
          lon: a.location.lon,
          country: a.location.country,
          country_code: a.location.country_code,
        }
      : null,
    note: a.note ?? '',
    confirmationCode: a.confirmation_code ?? '',
  }));
}

/** 把草稿轉成送往 action 的 payload；丟掉沒填標題的空白列、修剪文字。 */
export function draftsToPayload(drafts: ActivityDraft[]): ActivityPayload[] {
  return drafts
    .filter((d) => d.title.trim())
    .map((d) => ({
      time: d.time || null,
      end_time: d.endTime || null,
      title: d.title.trim(),
      type: d.type,
      location: d.location,
      note: d.note.trim(),
      confirmation_code: d.confirmationCode.trim(),
    }));
}

interface ActivityListEditorProps {
  activities: ActivityDraft[];
  onChange: (next: ActivityDraft[]) => void;
}

export default function ActivityListEditor({ activities, onChange }: ActivityListEditorProps) {
  const t = useTranslations('itinerary.activities');

  const patch = (key: string, fields: Partial<ActivityDraft>) =>
    onChange(activities.map((a) => (a.key === key ? { ...a, ...fields } : a)));
  const remove = (key: string) => onChange(activities.filter((a) => a.key !== key));
  const add = () => onChange([...activities, makeEmptyActivity()]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('heading')}</Label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          {t('add')}
        </Button>
      </div>

      {activities.length === 0 ? (
        <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.key} className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  aria-label={t('time')}
                  className="w-[7.5rem]"
                  value={activity.time}
                  onChange={(e) => patch(activity.key, { time: e.target.value })}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="time"
                  aria-label={t('endTime')}
                  className="w-[7.5rem]"
                  value={activity.endTime}
                  onChange={(e) => patch(activity.key, { endTime: e.target.value })}
                />
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => remove(activity.key)}
                  title={t('remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="flex-1"
                  placeholder={t('titlePlaceholder')}
                  value={activity.title}
                  onChange={(e) => patch(activity.key, { title: e.target.value })}
                />
                <Select
                  value={activity.type}
                  onValueChange={(v) => patch(activity.key, { type: v as ActivityType })}
                >
                  <SelectTrigger className="sm:w-40" aria-label={t('typeLabel')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                onChange={(loc) => patch(activity.key, { location: loc })}
                placeholder={t('locationPlaceholder')}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="sm:w-48"
                  placeholder={t('confirmationCodePlaceholder')}
                  value={activity.confirmationCode}
                  onChange={(e) => patch(activity.key, { confirmationCode: e.target.value })}
                />
                <Input
                  className="flex-1"
                  placeholder={t('notePlaceholder')}
                  value={activity.note}
                  onChange={(e) => patch(activity.key, { note: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
