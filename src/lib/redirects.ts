/**
 * 驗證登入後導向目標為站內路徑，避免 open redirect：
 * 只接受以單一 '/' 開頭的相對路徑（'//evil.com'、'/\\evil.com' 會被
 * 瀏覽器視為 protocol-relative 外部網址，一律拒絕）。
 */
export function sanitizeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  return value;
}
