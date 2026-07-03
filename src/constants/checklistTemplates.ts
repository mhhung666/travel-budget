/**
 * 清單範本：解「冷啟動空白」——新增清單時給旅行情境的預設項目，不必自己從零發明。
 * 這裡只放 id + emoji（結構常數）；標題與各項目文字走 i18n（`checklist.templates.<id>`），
 * 四語系各自維護，選取後由 `createChecklistWithItems` 一次寫入。
 */

import type { ChecklistKind } from '@/types';

export interface ChecklistTemplate {
  /** i18n key 與識別碼；對應 messages 的 `checklist.templates.<id>`。 */
  id: string;
  /** 選單前綴的 emoji。 */
  emoji: string;
  /** 建立時帶入的清單類型（決定勾選語意）。 */
  kind: ChecklistKind;
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  { id: 'preTrip', emoji: '✈️', kind: 'todo' },
  { id: 'packing', emoji: '🎒', kind: 'packing' },
  { id: 'shopping', emoji: '🛍️', kind: 'shopping' },
  { id: 'documents', emoji: '💊', kind: 'todo' },
];
