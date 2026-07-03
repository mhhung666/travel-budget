import type { ExpenseAttachment } from './expense';

/**
 * 一則隨手記（前端 DTO）。旅程成員共享的速記（想到但尚未排入行程的點子）；
 * `author_name` 為建立當下快照。`planned_at` 非 null 表示已轉成行程活動，
 * `planned_day_number` 為轉換當下的行程日編號快照（Badge 顯示用）。
 * `attachments` 為內嵌照片（沿用收據附件形狀；檢視走短效簽名 URL）。
 */
export interface TripNote {
  id: string;
  trip_id: string;
  text: string;
  author_id: string;
  author_name: string;
  attachments: ExpenseAttachment[];
  pinned: boolean;
  planned_at: string | null;
  planned_day_number: number | null;
  created_at: string;
  updated_at: string;
}
