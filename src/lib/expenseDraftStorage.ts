import type { SplitMode } from '@/lib/expenseSplit';
import type { ExpenseAttachment } from '@/types';

/**
 * 記帳表單的本機草稿（docs/UX_IMPROVEMENTS.md 第 1 項）。
 *
 * 旅行途中記帳常被打斷，關掉視窗就重填的挫折感很高，因此「新增支出」表單的內容
 * 在關閉時（以及編輯過程中）存進 localStorage，下次打開同一趟旅行可以接著填。
 * 每趟旅行各存一份（key 含 tripId），避免在多趟旅行間切換時互相覆蓋。
 *
 * 只存新增模式：編輯既有支出改用關閉前確認，草稿不落地，免得和伺服器上的支出不同步。
 */

/** 草稿結構改變時 bump，舊版草稿會被視為無效直接丟棄（不做遷移）。 */
export const EXPENSE_DRAFT_VERSION = 1;

/** 超過這個時間沒再打開的草稿視為過期；旅行結束後不該再跳出舊內容。 */
export const EXPENSE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ExpenseDraftForm {
  payer_id: string;
  original_amount: string;
  currency: string;
  exchange_rate: string;
  description: string;
  category: string;
  date: string;
}

export interface ExpenseDraftSnapshot {
  form: ExpenseDraftForm;
  splitMode: SplitMode;
  splitState: Record<string, { selected: boolean; value: string }>;
  itineraryDayIds: string[];
  tags: string[];
  attachments: ExpenseAttachment[];
}

interface StoredExpenseDraft {
  version: number;
  savedAt: number;
  snapshot: ExpenseDraftSnapshot;
}

export function expenseDraftKey(tripId: string): string {
  return `expense-draft:v${EXPENSE_DRAFT_VERSION}:${tripId}`;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 私密瀏覽或停用 storage 時直接放棄草稿功能，不影響記帳本身。
    return null;
  }
}

function isDraftForm(value: unknown): value is ExpenseDraftForm {
  if (!value || typeof value !== 'object') return false;
  const form = value as Record<string, unknown>;
  return (
    [
      'payer_id',
      'original_amount',
      'currency',
      'exchange_rate',
      'description',
      'category',
      'date',
    ] as const
  ).every((key) => typeof form[key] === 'string');
}

function isSnapshot(value: unknown): value is ExpenseDraftSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return (
    isDraftForm(snapshot.form) &&
    typeof snapshot.splitMode === 'string' &&
    !!snapshot.splitState &&
    typeof snapshot.splitState === 'object' &&
    Array.isArray(snapshot.itineraryDayIds) &&
    Array.isArray(snapshot.tags) &&
    Array.isArray(snapshot.attachments)
  );
}

/** 讀取草稿；格式不符、版本不同或已過期都回 null（並順手清掉）。 */
export function loadExpenseDraft(tripId: string, now = Date.now()): ExpenseDraftSnapshot | null {
  const store = storage();
  if (!store) return null;
  const key = expenseDraftKey(tripId);
  let raw: string | null = null;
  try {
    raw = store.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearExpenseDraft(tripId);
    return null;
  }

  const stored = parsed as Partial<StoredExpenseDraft> | null;
  if (
    !stored ||
    stored.version !== EXPENSE_DRAFT_VERSION ||
    typeof stored.savedAt !== 'number' ||
    !isSnapshot(stored.snapshot)
  ) {
    clearExpenseDraft(tripId);
    return null;
  }

  if (now - stored.savedAt > EXPENSE_DRAFT_TTL_MS) {
    clearExpenseDraft(tripId);
    return null;
  }

  return stored.snapshot;
}

/** 寫入草稿；回傳是否真的存進去了（配額用盡／storage 不可用時為 false，呼叫端才不會謊報已保留）。 */
export function saveExpenseDraft(
  tripId: string,
  snapshot: ExpenseDraftSnapshot,
  now = Date.now()
): boolean {
  const store = storage();
  if (!store) return false;
  const record: StoredExpenseDraft = { version: EXPENSE_DRAFT_VERSION, savedAt: now, snapshot };
  try {
    store.setItem(expenseDraftKey(tripId), JSON.stringify(record));
    return true;
  } catch {
    // 配額用盡或 storage 不可用：草稿存不下不該讓使用者記不了帳，改由呼叫端提示。
    return false;
  }
}

export function clearExpenseDraft(tripId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(expenseDraftKey(tripId));
  } catch {
    // 同上，清不掉就算了。
  }
}

/** 穩定序列化（splitState 依 key 排序），供草稿與初始值比對「有沒有改過」。 */
export function serializeExpenseDraft(snapshot: ExpenseDraftSnapshot): string {
  return JSON.stringify({
    form: snapshot.form,
    splitMode: snapshot.splitMode,
    splitState: Object.keys(snapshot.splitState)
      .sort()
      .map((id) => [
        id,
        snapshot.splitState[id]?.selected ?? false,
        snapshot.splitState[id]?.value ?? '',
      ]),
    itineraryDayIds: [...snapshot.itineraryDayIds].sort(),
    tags: [...snapshot.tags].sort(),
    attachments: snapshot.attachments.map((attachment) => attachment.key),
  });
}

export function expenseDraftEquals(a: ExpenseDraftSnapshot, b: ExpenseDraftSnapshot): boolean {
  return serializeExpenseDraft(a) === serializeExpenseDraft(b);
}
