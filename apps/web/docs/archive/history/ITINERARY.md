# 行程日期與 PDF 交付摘要

2026-09-18 已完成下列範圍；原規劃／方案比較查 Git。現況見 [FEATURES](../../FEATURES.md)，待驗與未排程範圍見 [文件入口](../../README.md#待驗與未排程事項)。

## 依日期新增行程日

新增可選日期、顯示 Day N，14 天內有日期快捷；允許先建 Day 1／3 再補 Day 2，不產空白日、不因刪除重編日期。無開始日使用正整數天數；伺服器驗範圍／同日唯一性，AI 匯入仍附加既有日。沿用 dayNumber，不增獨立日期欄位。

入口：`ItineraryDayDialog.tsx`、`itineraryDayCreation.ts`、`itineraryDayDeletion.ts`。已補 helper／Dialog／並行測試；當次未跑 replica-set concurrency 或真機／讀屏。整天改期、自訂月曆與批次新增未排程。

## PDF 匯出

已建立日期可匯出可搜尋 A4 PDF，成員可選確認碼（預設不含），訪客無此選項。產檔前重新授權讀已存資料；公開讀取 no-store／nonce／SW NetworkOnly，不宣稱 DB 快照。Markdown 先轉資料，Worker 排版，關閉終止、過期回應忽略、URL 回收及逾時可重試。

CJK TTF 按需下載、不進 precache，授權見 [字型文件](../../../public/fonts/README.md)。不嵌圖片／票券；表格逐列、粗斜體以底線、缺字顯示 Unicode；Page 不用相對 lineHeight。無離線產檔或 PDF/UA 承諾。

當時 45 項測試、正式 build／Chromium 下載通過，解析核對 450 活動、長備註、四語／頁碼；3／14／30 天合成資料約 0.55／0.92／2.07 秒，不能外推手機。390px viewport 不是實機；當次獨立 tsc 的舊 `.next/dev/types` 問題未計通過。

重跑：在 `apps/web` 執行 `pnpm build`，另一終端 `pnpm start --port 3101`，再跑 `node scripts/verify-itinerary-pdf.mjs`；先安裝 Playwright Chromium，`PDF_TEST_ORIGIN` 可指定測試網址。相關測試為 `src/__tests__/itineraryPdf*.test.ts*`。
