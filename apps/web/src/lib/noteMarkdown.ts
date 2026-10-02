/**
 * 隨手記 Markdown 純函式工具：
 * - 首行標題／摘要抽取（NoteCard 摺疊顯示、planNote 轉活動標題共用）
 * - GFM task list 勾選狀態的原文改寫（NoteCard 互動 checkbox 用）
 *
 * 刻意用行級啟發式而非完整 parser：速記內容以簡單語法為主，與 remark
 * 的歧異僅在罕見邊界（如巢狀引用內的清單）。fenced code block 內的內容
 * 一律不當語法解析，避免 task 序號與渲染結果對不上。
 */

/** fenced code block 的開閉行（``` 或 ~~~，容許 ≤3 格縮排）。 */
const FENCE_RE = /^ {0,3}(?:```|~~~)/;

/** 水平線（---／***／___ 獨佔一行）。 */
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * GFM task list 項目：清單記號（含引用/縮排前綴）＋ `[ ]`/`[x]`，
 * 後面必須跟空白才算 checkbox（與 GFM 規格一致）。
 */
const TASK_RE = /^((?:[ \t]|>[ \t]?)*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\](?=[ \t]))/;

/** 去掉行首的區塊語法前綴（多層引用、標題、清單記號、task checkbox）。 */
function stripBlockPrefix(line: string): string {
  return line
    .replace(/^(?:\s*>\s*)+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '');
}

/** 去掉常見行內語法（圖片→alt、連結→文字、粗斜體、刪除線、行內碼）。 */
function stripInline(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/** 一行 markdown → 純文字（供標題/摘要顯示）。 */
export function markdownLineToPlain(line: string): string {
  return stripInline(stripBlockPrefix(line)).trim();
}

export interface NoteSummary {
  /** 首個有內容的行的純文字（摺疊卡片標題、planNote 活動標題）。 */
  title: string;
  /** 其餘行合併成的純文字摘要（單一空白分隔；無則空字串）。 */
  excerpt: string;
}

/** 把筆記全文濃縮成「標題＋摘要」純文字（跳過水平線；code 內容原樣保留）。 */
export function summarizeNote(text: string): NoteSummary {
  const plain: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    const p = inFence ? line.trim() : markdownLineToPlain(line);
    if (!inFence && HR_RE.test(line)) continue;
    if (p) plain.push(p);
  }
  const [title = '', ...rest] = plain;
  return { title, excerpt: rest.join(' ') };
}

/** 摺疊門檻：超過 4 行或 160 字才摺疊，短便籤維持全文直出。 */
const COLLAPSE_LINES = 4;
const COLLAPSE_CHARS = 160;

/** 這則筆記在列表中是否該預設摺疊（標題＋摘要）。 */
export function shouldCollapseNote(text: string): boolean {
  const t = text.trim();
  return t.split('\n').length > COLLAPSE_LINES || t.length > COLLAPSE_CHARS;
}

/**
 * 切換第 `index` 個（0-based，依渲染順序＝原文順序）task checkbox 的勾選狀態，
 * 回傳改寫後全文；找不到該序號回 null。fenced code block 內的 `- [ ]` 不計。
 */
export function toggleNoteTask(text: string, index: number): string | null {
  if (index < 0) return null;
  const lines = text.split('\n');
  let inFence = false;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (FENCE_RE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = TASK_RE.exec(lines[i]);
    if (!m) continue;
    if (seen === index) {
      const next = m[2] === ' ' ? 'x' : ' ';
      lines[i] = lines[i].replace(TASK_RE, `$1${next}$3`);
      return lines.join('\n');
    }
    seen += 1;
  }
  return null;
}
