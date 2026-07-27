/**
 * PWA「記一筆」捷徑的穩定落點。
 * AppShell 偵測這個 route 後啟動與一般網頁入口相同的 GlobalQuickAddFlow，
 * 因此單一旅行直達、多旅行 picker、沒有旅行時建立流程都共用同一套規則。
 * 未登入由 proxy.ts（PROTECTED_ROUTES 含 /quick-add）導去 /login。
 */
export default function QuickAddPage() {
  return null;
}
