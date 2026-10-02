# 行程 PDF 匯出

2026-09-18 首版完成自動化與桌面瀏覽器驗證；真機／PWA 仍待驗。

## 已交付與設計重點

- 選擇已建立日期，匯出可搜尋的 A4 PDF；可含每日說明，成員可選確認碼（預設不含），訪客無此選項。
- 產檔前重新授權讀取已存資料；離線／儲存中不匯出。公開讀取用 no-store、nonce 與 SW NetworkOnly，並非 DB 交易快照。
- Markdown 在主執行緒轉資料，Web Worker 排版；關閉會終止工作，過期回應忽略、Object URL 回收，逾時可重試。
- 靜態 CJK TTF 按需下載且不進 SW precache；字型來源、授權與重製見 [字型文件](../../public/fonts/README.md)。不用 WOFF 原型，避免 glyph 重複解壓的效能問題。
- 不嵌圖片／票券，表格逐列呈現；粗斜體以底線強調，不支援字元顯示 Unicode 編碼。不要在 Page 使用相對 lineHeight，避免跨頁頁尾累積偏移。

## 驗證與重跑

當時 45 項相關測試、正式 build 與 Chromium 下載通過；實際 PDF 解析核對 450 活動、長備註、四語、頁碼及邊界。初版 3／14／30 天桌面合成資料耗時約 0.55／0.92／2.07 秒，不能外推手機效能。390px viewport 也通過公開頁流程，但不是實機。

在 `apps/web` 執行 `pnpm build`，另一終端執行 `pnpm start --port 3101`，再跑 `node scripts/verify-itinerary-pdf.mjs`。需先 `pnpm exec playwright install chromium`；`PDF_TEST_ORIGIN` 可指定測試網址。測試檔為 `src/__tests__/itineraryPdf*.test.ts*`。

尚待 iOS Safari、Android Chrome、PWA 開啟／儲存、慢網首次字型下載及中階手機效能；不承諾離線產檔或 PDF/UA。當次獨立 tsc 曾遇到舊 `.next/dev/types` 的已刪頁面引用，未把該項記為通過。
