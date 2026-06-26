export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** 指派成員的 id；未指派時為 null。 */
  assignee_id: string | null;
  /** 指派成員的顯示名稱；未指派或該成員已不存在時為 null。 */
  assignee_name: string | null;
}

export interface Checklist {
  id: string;
  trip_id: string;
  title: string;
  items: ChecklistItem[];
  created_at: string;
  updated_at: string;
}
