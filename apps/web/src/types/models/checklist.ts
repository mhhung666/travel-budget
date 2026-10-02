/** 清單類型：決定勾選語意與加值行為（見 Checklist model）。 */
export type ChecklistKind = 'todo' | 'packing' | 'shopping';

export interface ChecklistItem {
  id: string;
  text: string;
  /**
   * 共享語意的完成狀態（= `done_by` 非空）。todo / shopping 用這個；
   * packing 請改看 `done_by` 是否包含目前使用者。
   */
  done: boolean;
  /** 勾選此項的成員 id 陣列。packing 逐人各自勾；共享清單則存標記者的 id。 */
  done_by: string[];
  /** 指派成員的 id；未指派時為 null。 */
  assignee_id: string | null;
  /** 指派成員的顯示名稱；未指派或該成員已不存在時為 null。 */
  assignee_name: string | null;
}

export interface Checklist {
  id: string;
  trip_id: string;
  /** 清單類型（預設 'todo'）。 */
  kind: ChecklistKind;
  title: string;
  items: ChecklistItem[];
  created_at: string;
  updated_at: string;
}
