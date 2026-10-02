import type { Activity } from '@/types';

/**
 * 把當日活動依時間排序：有時間者在前、依 "HH:mm" 升冪；未指定時間（null）者排在最後，
 * 且彼此維持原本的相對順序（穩定排序）。"HH:mm" 為零補位 24h，字串比較即等於時間比較。
 *
 * 不修改傳入陣列（回傳新陣列）。
 */
export function sortActivities<T extends Pick<Activity, 'time'>>(activities: readonly T[]): T[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((a, b) => {
      const ta = a.activity.time;
      const tb = b.activity.time;
      if (ta && tb) return ta.localeCompare(tb) || a.index - b.index;
      if (ta) return -1; // a 有時間、b 沒有 → a 在前
      if (tb) return 1;
      return a.index - b.index; // 兩者皆無時間 → 維持原順序
    })
    .map(({ activity }) => activity);
}
