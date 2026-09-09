# Q3：預載決策與可重跑效能量測

更新日期：2026-09-09

## 預載決策

| 頁面／策略 | 現況與判斷 | 本次決策 |
| --- | --- | --- |
| 旅程首頁 | `useLandingRead`／`bootstrapLanding` 將冷啟動 trip、shell、itinerary 合併，填入既有 query keys；已有快取時走各資源更新，不下載 expenses | 保留合併入口與 Next Link 路由預載；不額外 idle 預讀整個旅程 |
| 支出頁 | shell、trip、expenses、members、itinerary 各有精確 key；已有 30 秒 freshness 與 IndexedDB persistence；完整 expense DTO 同時供搜尋、匯出、編輯及樂觀更新使用 | 不因滑過分頁就預先下載全量支出；維持進入頁面才查詢 |
| Server prefetch + hydration | 要先取得 session／public hash 授權；首頁 shell 的 today_spent 還依瀏覽器當地日期。伺服器 await DB 會把等待移入 TTFB，並與離線 restore、optimistic data 競爭 | 本次評估不導入。先修正 client-only 頁面的 hydration 邊界；沒有正式冷載入 trace 證明 DB 等待與收益前，不增加第二套資料初始化流程 |
| Cursor pagination | 目前 20 筆只是 DOM 漸進顯示，不是網路分頁；直接改 getExpenses 會破壞全量搜尋／匯出與 mutation 契約 | 本次不改。正式樣本達 1,000 筆或 JSON 超過 1 MiB 時進入分頁評估，再以手機長任務／下載成本判斷；這是評估觸發值，不是已觀測到的正式資料量 |

後續若導入 server hydration，必須使用 request-scoped QueryClient、相同授權與 query keys、
明確 updatedAt 合併策略，不把錯誤／私人資料寫入共享伺服器快取；保留離線樂觀新增，
並驗證跨帳號清理、hash 訪客、當地日期與 warm reload 無重複查詢。
分頁需另外提供完整匯出／伺服器篩選，排序採 date + `_id`，驗證同日游標、更新／刪除與離線新增。

## 本機量測方式

```sh
pnpm build
pnpm exec playwright install chromium
pnpm perf:query-ux
# 本機已有 Chrome 可用；不需要新增 .env 參數
pnpm perf:query-ux --channel=chrome --samples=3 --rows=1000 --output=coverage/query-ux
node scripts/measure-client-entry.mjs
```

量測工具只啟動本機 production server 與 loopback fixture proxy，不接受正式站 URL 或登入資訊。
子程序覆蓋 MongoDB URI 為不可連線的本機位址、使用測試 session secret；不讀取正式資料。
proxy 攔截所有 API，只有固定公開旅程 DTO；POST 僅放行 manifest 精確識別的匿名 current-user／
未讀數讀取（不帶 session，伺服器授權即返回），其餘拒絕。未預期 API／寫入、page error 會使量測失敗。
不測 AI provider、建立支出、通知投遞、migration 或登入寫入。

- 旅程首頁、支出頁，各 3 組 cold → warm；desktop、mobile、worker 共 36 次頁面載入。
- cold 是新 browser context：HTTP、IndexedDB、SW cache 皆空；不是 Vercel／MongoDB 冷啟動。
- warm 保留同一 context 後 reload；固定等待 1.3 秒讓 persistence 的 1 秒節流完成。
- desktop 1440×900／CPU 1x；mobile 390×844／觸控、DPR 3／CPU 4x。旅程起迄日依執行時台北日期設定，維持 in-trip 階段並寫入報告；固定 API 延遲 80 ms，網路是本機，**沒有模擬 4G**。
- worker 組實際註冊並確認 controller；非 worker 組模擬不支援 SW，避免 Playwright 禁止註冊造成套件錯誤。
- worker 組是瀏覽器內的 service worker 測試，**不是實機安裝、standalone、iOS Safari 或離線驗收**。
- 不使用 Playwright request routing，避免它關閉 HTTP cache，讓 warm 樣本失真。

每組產出 `results.json`、Playwright `.zip`（Network／畫面／DOM）、Chrome `.performance.json`
（DevTools Performance 可載入）與本機 server log，放在 gitignored `coverage/`。
若有 page error 或未預期 API，先保存結果再返回失敗。JSON 包含 build ID、瀏覽器版本、資料筆數、TTFB、內容 ready、LCP、長任務、JS transfer、
API／POST 次數與輸入後兩次 rAF 延遲；不含正式資料或憑證。

`readyMs` 是導航至可見搜尋欄／行程日的實驗室時間；LCP、Event Timing、rAF 各自不同，
不能將 rAF 或少量 event duration 叫做正式 INP。JS transfer 是 Resource Timing 的 page 資源，
不涵蓋 service worker 預快取流量，不能解讀成 PWA 安裝總成本。
每格只有 3 筆時只報中位數／範圍，不報可信 p95，也不以這組資料聲稱正式站 LCP／INP 已改善。

## 正式環境的後續驗收邊界

2026-09-09：Q 工程已結案，使用者回報已 push；本次未確認 Vercel production 部署或執行正式站驗收。
後續觀測統一移交改善建議 M，待辦見 [部署後驗收清單](./QUERY_UX_PROGRESS.md#部署後驗收移交-m尚未執行)。

本次完成的是 Q3 程式交付與可重跑的本機 production-build 實驗。
正式登入資料、Vercel cold start、Atlas 延遲、真實手機與安裝 PWA 長尾不在這份合成資料量測內。
部署後應在同版本、同路線、同資料量與帳號權限下，分開 cold／warm、裝置、網路、SW 控制狀態，
保留 Network 與 Performance trace，再比較分布。登入 trace／HAR 可能含 cookie、token 與私人 DTO，
不得直接 commit 或公開分享。

## 最終量測結果（2026-09-09）

Q2 基準 build：`Tio32MUVmAgP4jl6rhbQN`；Q3 最終 build：`d-2oLgnUwykH4qcH_H1y-`。
各格 cold／warm 各 3 筆，以下為 readyMs 中位數，單位 ms。

| 裝置／頁面 | Q2 cold／warm | Q3 cold／warm |
| --- | --- | --- |
| desktop／首頁 | 291／78 | 297／92 |
| desktop／支出 | 279／74 | 272／85 |
| mobile／首頁 | 632／318 | 595／310 |
| mobile／支出 | 578／310 | 573／288 |
| worker／首頁 | 626／303 | 617／280 |
| worker／支出 | 582／287 | 588／260 |

**不能宣稱整體載入速度改善**：有升有降、樣本少，而且基準是 09-08、最終是 09-09，
本機 Chrome 從 152.0.7977.82 自動更新為 152.0.7977.83。旅程日期配合當天保持相同 in-trip 階段。
此表是可追溯的實驗觀測，不是控制所有變因的 A/B 或正式站前後驗收。

- 最終 **36 次載入通過、0 page errors、0 未預期 API／寫入**。基準有 2 次 warm 首頁 hydration error；
  只加頁面邊界仍會重現，補齊 Shell query feedback／會員區塊後才通過。另有 deterministic SSR→快取提前完成的單元回歸。
- 1,000 筆 synthetic expenses JSON 為 301,796 bytes；首頁 cold DTO GET 為 1 次 landing、支出頁 cold 為 5 次；
  兩頁 warm 的 DTO GET 均為 0。另有匿名未讀數／current-user 的 POST：首頁 cold／warm 為 2／2，支出為 3／3。
  `searchRequests` 是搜尋至 settle 期間的請求，可能包含既有背景 POST，不等於搜尋本身造成的請求。
- 最終支出頁輸入後兩次 rAF 延遲（cold＋warm 全部字元樣本中位數）：desktop 25.1 ms、mobile 16.8 ms、worker 14.1 ms。
  這不是 INP，也不是篩選總耗時；輸入與列表 commit 的先後由 React Profiler 測試獨立驗證。
- LCP 原始觀測保留 JSON，但腳本在內容 ready 後開始輸入；首次互動會停止 LCP 更新，且 skeleton 可能成為候選，
  故不將這組 LCP 當作完整業務內容 ready 或正式 CWV 驗收。
- page script transfer 中位數 cold／warm：首頁 472,003／600 bytes，支出 352,402／600 bytes。
  此值受 HTTP／SW cache 影響，不是所有安裝流量。Bundle entry gzip：AppShell 維持 108,794 bytes；
  首頁 282,928（較 Q2 +253）、支出 163,927（+277）。Q3 重點是排程與 hydration 正確性，不是再減少 bundle。

完整本機產物：`coverage/query-ux-before/` 與 `coverage/query-ux-final-verified/`；
校正／失敗的中間 run 不納入最終通過數。這些資料不進 Git，以上摘要與重跑腳本隨 commit 保留。
