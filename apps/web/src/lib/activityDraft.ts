import type { Activity, ActivityType, ExpenseAttachment } from '@/types';
import type { ActivityPayload } from '@/hooks/queries/useItineraryMutations';
import type { LocationOption } from '@/components/location/LocationAutocomplete';

/** 編輯器內的活動草稿。time/endTime 以空字串表示未指定（submit 時轉成 null）；key 為前端 render key。 */
export interface ActivityDraft {
  key: string;
  /** 儲存身分獨立於 render key；新草稿沒有 MongoDB ID。 */
  id: string | null;
  time: string;
  endTime: string;
  title: string;
  type: ActivityType;
  location: LocationOption | null;
  locationName: string;
  note: string;
  confirmationCode: string;
  /** 票券附件（已上傳至 R2，含 key + 中繼資料）。 */
  attachments: ExpenseAttachment[];
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `act-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeEmptyActivity(): ActivityDraft {
  return {
    key: uid(),
    id: null,
    time: '',
    endTime: '',
    title: '',
    type: 'other',
    location: null,
    locationName: '',
    note: '',
    confirmationCode: '',
    attachments: [],
  };
}

/** 把已儲存的活動 DTO 轉成編輯器草稿（開啟對話框時用）。 */
export function dayActivitiesToDrafts(activities: Activity[]): ActivityDraft[] {
  return activities.map((a) => ({
    key: a.id || uid(),
    id: a.id,
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
    locationName: a.location_name ?? '',
    note: a.note ?? '',
    confirmationCode: a.confirmation_code ?? '',
    attachments: a.attachments ?? [],
  }));
}

/** 把草稿轉成送往 action 的 payload；丟掉沒填標題的空白列、修剪文字。 */
export function draftsToPayload(drafts: ActivityDraft[]): ActivityPayload[] {
  return drafts
    .filter((d) => d.title.trim())
    .map((d) => ({
      id: d.id,
      time: d.time || null,
      end_time: d.endTime || null,
      title: d.title.trim(),
      type: d.type,
      location: d.location,
      location_name: d.locationName.trim(),
      note: d.note.trim(),
      confirmation_code: d.confirmationCode.trim(),
      attachments: d.attachments,
    }));
}
