/**
 * 把純文字切成「文字段」與「連結段」，供隨手記等 UI 把裸網址渲染成可點連結
 * （回傳資料結構而非 HTML，交給 React 渲染，避免 dangerouslySetInnerHTML 的 XSS 風險）。
 */

export interface TextSegment {
  type: 'text';
  value: string;
}

export interface LinkSegment {
  type: 'link';
  /** 完整 href（含 scheme），開新分頁用。 */
  href: string;
  /** 顯示文字（過長時截短為「網域 + 路徑起頭 …」）。 */
  display: string;
}

export type LinkifySegment = TextSegment | LinkSegment;

/**
 * 比對 http(s):// 開頭的網址。結尾的常見標點（. , ; : ! ? 及成對括號的右半）不納入連結，
 * 免得「(https://a.com)」把右括號吃進去。全域旗標，供 matchAll 逐段切割。
 */
const URL_RE = /https?:\/\/[^\s<]+/gi;

/** 網址結尾常被誤納的標點（含全形），成對括號另外處理。 */
const TRAILING = /[.,;:!?'"。、！？；：）】」』]+$/;

/** 顯示截短上限（超過就砍成 網域 + 路徑起頭 …）。 */
const MAX_DISPLAY = 32;

function trimTrailingPunctuation(url: string): string {
  let out = url.replace(TRAILING, '');
  // 網址不含左括號時，去掉懸空的右括號（例如 markdown「(url)」）。
  if (out.endsWith(')') && !out.includes('(')) out = out.slice(0, -1);
  return out;
}

/** 把網址縮短成好讀的顯示字串：去 scheme、砍 www、過長者截尾加省略號。 */
function shortenUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  const noTrailingSlash = stripped.replace(/\/$/, '');
  if (noTrailingSlash.length <= MAX_DISPLAY) return noTrailingSlash;
  return `${noTrailingSlash.slice(0, MAX_DISPLAY - 1)}…`;
}

/**
 * 將文字切成文字段/連結段。非網址文字原樣保留（含換行，由呼叫端以 whitespace-pre-wrap 呈現）。
 */
export function linkify(text: string): LinkifySegment[] {
  const segments: LinkifySegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const start = match.index;
    const href = trimTrailingPunctuation(raw);
    // 被去掉的尾標點要退回文字段（例如網址後的句號）。
    const dropped = raw.slice(href.length);

    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    segments.push({ type: 'link', href, display: shortenUrl(href) });
    if (dropped) segments.push({ type: 'text', value: dropped });
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}
