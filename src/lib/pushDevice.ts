/**
 * 從 User-Agent 解析友善的「瀏覽器 · 系統」標籤，供設定頁「已訂閱裝置列表」顯示
 * （ROADMAP #9 Phase 3 打磨）。純函式、可單元測試；瀏覽器/系統名為專有名詞，不在地化。
 */

/** 偵測瀏覽器。順序重要：Edge/Opera 的 UA 也含 Chrome，須先判；Safari 須最後判。 */
function detectBrowser(ua: string): string {
  if (/\bEdg(?:e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/\bOPR\/|\bOpera\//.test(ua)) return 'Opera';
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'Firefox';
  if (/\bChrome\/|\bCriOS\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua)) return 'Safari';
  return '';
}

/** 偵測作業系統。順序重要：Android UA 也含 Linux、iOS UA 也含 Mac OS X，須先判前者。 */
function detectOS(ua: string): string {
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/iPod/.test(ua)) return 'iPod';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

/**
 * 回傳如「Chrome · macOS」「Safari · iPhone」的標籤；無法辨識其一時退回另一個，
 * 全無法辨識（或無 UA）時回空字串（呼叫端以在地化的「未知裝置」遞補）。
 */
export function describeUserAgent(ua?: string | null): string {
  if (!ua) return '';
  const browser = detectBrowser(ua);
  const os = detectOS(ua);
  if (browser && os) return `${browser} · ${os}`;
  return browser || os || '';
}
