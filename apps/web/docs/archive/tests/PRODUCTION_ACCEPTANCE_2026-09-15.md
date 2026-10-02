# 正式站背景更新補充驗收（2026-09-15）

## 驗收範圍調整

依使用者決定，iOS Safari／安裝版 PWA 暫時通過，本輪不執行、不列為阻擋。
這是接受暫緩實測，沒有新增 iOS 或 standalone 實機證據。M 的效能與其他待驗項目仍獨立追蹤。
S 正式站修正結果見 [摘要複驗](PRODUCTION_ACCEPTANCE_2026-09-14.md#09-15-摘要時序複驗)。

## 支出背景更新失敗與手動重試

**桌面與手機 viewport 均通過。** 兩組各攔截到兩次失敗讀取，九筆支出與 NT$253 摘要保留；
手動重試回 200 後提示消失、資料一致，最終兩組均無 page error。

目標為 `https://budget.mhhung.com`，沿用使用者已登入的帳號，唯讀操作既有合成驗收旅程。
每種寬度建立新的 browser context，只帶登入 storage state，不帶原分頁 IndexedDB。
使用 Chrome，桌面 1440px、手機 viewport 390px；手機寬度不等同 iOS 或安裝版 PWA。

步驟：

1. 正常載入九筆合成支出與 NT$253 摘要，辨識支出讀取請求。
2. 等待 31 秒，讓查詢超過 30 秒 freshness，並讓 IndexedDB 保存完成。
3. 只攔截該支出讀取請求，使其 transport failure，重載頁面觸發背景更新。
4. 等待「更新失敗，目前顯示上次成功載入的資料。」提示，檢查九筆支出與 NT$253 摘要仍可見。
5. 解除攔截，點擊提示內的重試按鈕，核對讀取成功、提示消失、列表與摘要不變。

為確保請求攔截生效，沿用專案效能工具的方式，在隔離 context 模擬瀏覽器不支援 service worker。
此情境驗證 IndexedDB 查詢快取與背景失敗恢復，不是離線或 SW 快取效能驗收。

## 證據與界線

暫存證據位於 `/tmp/budget-production-m-20260915/`：`background-result.json`、
兩種寬度的失敗／恢復截圖。截圖可能含帳號資訊，不加入 Git；暫存證據不保證永久保留。
沒有新增、修改或刪除正式支出，沒有觸發通知、cron、migration 或 AI provider；測試 context 執行後關閉。

校正執行不計入通過數：已處理回應文字編碼／讀取辨識、Playwright 禁止 SW 註冊
造成的 `waiting` 錯誤，並改為明確等待重試請求回 200，避免把進入 fetching 時
提示暫時消失誤判為恢復；手機組透過攔截讀取回應辨識 action，並等待攔截處理完成才解除。最終以無 SW 的隔離 context 完整重跑。

本次不代表所有頁面的背景更新、檢視器失敗重試、更多列表或代表性負載已驗收。
Vercel 部署 commit、MongoDB profiler/explain、完整效能量測與 P／R 收尾仍依原清單追蹤。
