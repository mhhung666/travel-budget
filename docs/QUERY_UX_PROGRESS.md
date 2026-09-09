# Q：查詢錯誤狀態與前端延遲載入

更新日期：2026-09-09

## 結案狀態

**Q1～Q3 工程交付已完成並結案；使用者於 2026-09-09 回報已 push。**
Push 不等於 Vercel production 部署成功或正式站驗收通過；這兩項本次未核對。

- 最終程式交付：`ac54811`；Q3 前兩階段：`89e8ba0`、`be76f1a`。
- 最終工程驗證：lint、Prettier、TypeScript、production build 通過；1,375 項測試通過、37 項 opt-in 跳過；36 次隔離本機瀏覽器載入無錯誤。
- 不需要 migration 或新增 `.env` 參數；本次收尾僅更新文件，未重跑上述程式驗證或操作正式資料。
- Server prefetch 已評估並決定維持現有 landing／IndexedDB 流程，不是漏做；cursor pagination 依資料量另案評估，由改善建議 G 追蹤。
- 正式環境觀測移交 [改善建議 M](./IMPROVEMENTS.md)，不再把 Q 列為待實作；AI 真實品質驗收仍依使用者要求暫緩。

### 部署後驗收移交 M（尚未執行）

- [ ] 確認 `budget.mhhung.com` 的 Vercel production deployment 包含 `ac54811`，記錄部署 commit 與驗收日期。
- [ ] 指定測試帳號檢查首頁／支出頁冷載入及快取重載，確認無 hydration error、內容與會員導覽正確。
- [ ] 在安全測試條件下檢查查詢失敗／離線／重試，已有內容不被整頁 loading 遮蔽。
- [ ] 檢查快速記帳、表單與 lightbox 的開關／重開／載入失敗重試，以及支出搜尋、清除與更多列表；不送出業務寫入或呼叫真實 AI provider。
- [ ] 依 [量測規範](./QUERY_UX_PERFORMANCE.md) 留存冷／熱、桌面／手機、實機安裝 PWA 的 Network／Performance 證據；不把本機 bundle 或 rAF 數據當成正式 CWV。

以下為各階段當時的歷史紀錄；「未 push」「仍待 Q2／Q3」等敘述不代表目前狀態。

## 分階段交付

各階段已驗證後 commit；行為變更依 AGENTS.md 更新版本。開發期間由代理不 push、不操作正式資料；後續由使用者 push。

| 階段 | 範圍 | 狀態 |
| --- | --- | --- |
| Q1a | 旅程列表 query 錯誤、重試、背景更新提示及快速記帳的列表錯誤 | 已完成 |
| Q1b | 其他 queries 與消費頁逐一配對，補錯誤 UI、auth-null 邊界及 stale data 顯示 | 已完成 |
| Q2 | 全域快速記帳與大型 dialogs／AI／lightbox 的 mount 與動態載入 | 已完成 |
| Q3 | 支出搜尋 deferred rendering、常用頁 prefetch 評估與 production build／瀏覽器量測 | 已完成（本機工程驗收） |

## Q1a

- `useTrips` 不再將 ActionResult 失敗轉成空陣列；共用 unwrap 工具保留 error code。
- 旅程列表首次失敗提供重試；只有成功取得空陣列才顯示真正的空資料狀態。
- 已有快取（包含空陣列）時，背景請求不切回整頁 skeleton；更新失敗保留內容並提示可重試。
- 同步涵蓋共用 `useTrips` 的地圖頁與收藏表單旅程選單；選單無資料時停用，重試按鈕不提交表單。
- QueryFeedback 提供四語的初次錯誤、背景更新／失敗與等待連線訊息，不直接向畫面輸出內部 error。
- `useTrips(enabled)` 允許關閉的快速記帳停止主動查詢；快速記帳查詢失敗不進入建立旅程流程。
- 快速記帳的列表錯誤採阻擋重試，避免依過期資格自動選團；已開啟支出表單的 metadata 錯誤另於 Q1b 處理。

驗證：新增真實 QueryClient＋旅程頁測試，涵蓋錯誤保留、重試恢復、背景 transport failure、
空快取與 enabled gating；另驗證快速記帳失敗不進建立流程／不發出誤導事件、關閉 gating 與離線等待訊息。
本階段新增 10 項測試通過；全套回歸為 1,302 通過、37 項 opt-in 跳過。
lint、Prettier 與 TypeScript 檢查通過；未執行真實 provider／DB 整合測試。
其他頁面尚未全面導入，本階段不代表 Q 結案，也不宣稱已解決正式站長尾。

## Q1b 第一批：隨手記、相簿與活動紀錄

- 三個 query 改用 `unwrapActionResult` 保留錯誤與 code，不再把失敗寫成成功的空清單。
- 隨手記頁、相簿頁與 ActivityFeed 使用共用 QueryFeedback：冷載入失敗提供重試，
  背景更新失敗保留快取內容；離線暫停且沒有資料時顯示等待連線，不顯示空清單。
- 旅程首頁共用照片 query 的每日照片也加上更新／失敗提示及重試；仍由 `isMember` 啟用，
  不新增公開 fallback，不改伺服器授權、照片 DTO、寫入與 mutation 流程。
- 登入／會員判斷、相簿 lightbox 的行程 metadata 與其他次要查詢仍屬後續批次，未宣稱全部完成。

驗證：三個真實 QueryClient＋頁面／元件各四情境，共新增 12 項測試，涵蓋初次失敗、
手動重試成功、背景 transport failure、權限拒絕及離線暫停。全套 1,314 通過、37 項 opt-in 跳過；
lint、Prettier、TypeScript 通過。沒有操作正式站、DB 或真實 provider；production build／瀏覽器量測仍待 Q3。

## Q1b 收尾：其餘查詢、登入與表單

Q1b 程式交付完成；Q2／Q3 仍獨立保留，不以本機測試冒稱正式站效能驗收。

| 查詢群組 | 消費端處理 |
| --- | --- |
| current user／members | 成功 auth-null 才代表未登入；服務錯誤保留 error，會員資格須完成解析，加入旅程／設定頁提供重試，不把故障判成未登入或無權限 |
| friends／collections／links | 好友頁、加入好友、建立旅程、收藏清單與帶入活動狀態提供重試；未知好友關係不顯示可發邀請，未知帶入狀態不執行帶入 |
| comments／counts、notifications／count | 留言與通知清單失敗不顯示空清單；計數失敗保留快取並提示，通知鈴可見失敗標記、面板可重試 |
| copyable checklists、行程日 metadata | 複製清單與筆記轉行程選單區別載入／失敗／成功空清單；未開啟的筆記選單不主動讀取 |
| map photos／visited places／collections | 地圖依目前模式彙整必要查詢，無資料失敗時可重試，背景失敗保留既有地圖 |
| shell／expenses／checklists／settlement／stats | 旅程頁面與次要摘要提供失敗／更新提示，快取不因背景失敗被清空或切回整頁錯誤 |
| exchange rates／year in review／loyalty | 匯率服務失敗不再寫入成功的 TWD-only 結果；回顧、會員與收藏表單的次要讀取有錯誤提示 |

新增 QueryStatus、combineReadStates 與 QueryReadDialog，統一區分 undefined、成功 null／空值與錯誤。
新增／編輯支出必須完成必要 metadata 才開啟；失敗、暫停與資格不足都有可關閉、可重試的介面，
取代原本可能無限等待的遮罩。表單 readiness 只彙整已啟用查詢，不為關閉表單強制取資料。

**保護性例外**：登入／會員資格發生錯誤時，設定與加入操作先要求重試，不依過期資格開放操作；
資料仍保留於快取。一般清單與圖表則保留 stale content。可選 metadata 不阻止不依賴它的操作，
但會顯示失敗提示。伺服器授權仍為最終防線，沒有新增公開路由或放寬權限。

**驗證**：新增其餘 11 種 action query 的失敗／重試與背景失敗測試、auth-null／會員解析、
disabled gating、匯率 service failure、五類記帳依賴失敗、可關閉的失敗／離線表單，
以及好友／收藏／留言／通知消費端與加入旅程防誤判測試。本批新增 46 項測試；最終全套 1,360 通過、37 項 opt-in 跳過。
lint（無警告）、Prettier、TypeScript 與 production build 均通過。
不跑正式站壓測／業務寫入／真實 AI provider；不需要 migration 或新增環境參數。

## Q3 範圍與驗收界線

- Q2 已完成動態 import 的可關閉／重試介面、重開／草稿及 metadata 查詢次數回歸。
- Cursor pagination 依真實資料量門檻另行評估，不能為滿足清單而直接更動全量清單契約。
- Q2 production build 與 bundle 比較已完成（見下）；Q3 已完成本機 Network／Performance 量測。
  正式站少量冷／熱混合樣本不作為改善基準；完整條件與限制見 [效能報告](./QUERY_UX_PERFORMANCE.md)。

## Q2 第一階段：全域入口與可恢復的 chunk 載入

- AppShell 不再靜態匯入快速記帳；未開啟不 mount flow、不啟動其旅程／metadata 查詢。
- 建立旅程與支出表單各自拆 chunk；picker／無旅程畫面不會順便 mount 表單。
- 共用 lazyDialog 首次 open 才 import，載入／失敗都有可關閉的 responsive dialog。
  import 失敗可重試；關閉後即使 promise 完成也不重新打開。
- 一般 dialog 首次開啟後保留元件，沿用各自草稿／reset 規則；全域 flow 關閉則卸載，
  沿用原本快速記帳關閉即結束的流程，不保存跨旅程草稿。
- Q2 分階段 WIP commit，版本於完整 Q2 最終交付更新一次。

### 可重現 bundle 基準

執行 `pnpm build` 後 `node scripts/measure-client-entry.mjs`。
讀取 client-reference manifest 的 entry chunks，逐檔 gzip 後加總；不同 entry 有共用 chunks，
**不可跨列加總，也不是瀏覽器實際傳輸量或 LCP**。基準來自 Q1b 的本機 production build。

| Entry | 基準 JS bytes | 基準 gzip bytes |
| --- | ---: | ---: |
| AppShell | 504959 | 168590 |
| trips | 357428 | 116434 |
| trips/[id] | 990595 | 307142 |
| trips/[id]/album | 538921 | 177872 |
| trips/[id]/expenses | 539545 | 174802 |

第一階段驗證：新增 3 項 lazy dialog 測試（首次 gating、草稿重開、pending 關閉、失敗重試）；
全套 1,363 通過、37 項 opt-in 跳過。lint、Prettier、TypeScript、production build 通過。

## Q2 第二階段：大型表單、AI 與 lightbox（完成）

| 入口 | 按需載入範圍 |
| --- | --- |
| 旅程列表／全域快速記帳 | 建立／加入旅程、完整支出表單 |
| Trip Shell／支出頁 | 新增／編輯支出及預算；新增支出點擊後仍並行載入 chunk 與 metadata，readiness 未完成只顯示可關閉 QueryReadDialog |
| 行程首頁 | 旅程編輯、整天／單一活動編輯、AI 行程匯入、航班／住宿帶入 |
| 相簿／行程首頁／地圖釘點 | 共用 PhotoLightbox 首次選照片才 import，保留 index=0、切換與關閉回呼 |
| 隨手記／清單／結算 | 編輯筆記、轉行程、建立／複製清單、記錄付款 |
| 收藏／旅程設定 | 航班／住宿表單、加入好友／虛擬成員、註冊／連結成員表單 |
| 記帳 AI | 手動模式僅載入輕量模式選單；選文字／收據才 import AI 輸入與預覽邏輯。chunk 載入／失敗只影響選配工具，手動欄位與整張表單仍可操作、關閉 |

小型確認視窗、首屏清單／縮圖與原本就可見的分享按鈕不強制拆 chunk。
公開相簿的簡單唯讀 lightbox 維持現狀；本階段處理的是共用成員相簿大型檢視器。
不做 idle 全量預載；避免未使用功能提早占用頻寬。僅使用者明確要求新增支出後 preload 該表單。
純 activity 草稿轉換抽離 editor 模組，避免首頁為工具函式引入編輯 UI；payload 契約不變。

### 狀態與驗證

- dialog 首次 open 後保留實例並傳入 closed props，沿用元件既有 reset 規則；
  例如筆記重開回到原文、AI 表單關閉後回到手動模式，同次開啟切模式保留文字。
- 全域快速記帳及 Shell 本來就以關閉結束新增流程，維持卸載；不新增草稿持久化。
- import 失敗重新建立 lazy promise 供明確重試；若部署舊 chunk 已被移除仍可能需要重新載入頁面，
  不自動 reload 而丟棄其他欄位。錯誤訊息不暴露 chunk URL 或內部例外。
- 新增實際 QueryClient＋延遲 PlanNoteSheet 測試：關閉零讀取；開啟一次；關閉 invalidate 不讀；
  重開已失效快取才再讀，fresh 重開不重複請求。
- 包含 import gating、pending 關閉後完成不重開、失敗重試、草稿重開、onOpenChange 適配、
  lightbox index／關閉、AI 手動模式／草稿重設、選配 AI 失敗不提交外層表單、明確 preload。
- Q2 合計新增 10 項測試；最終全套 **1,370 通過、37 項 opt-in 跳過**。
  lint（無警告）、Prettier、TypeScript、production build、diff whitespace 檢查通過。
- 不跑正式站壓測、DB／業務寫入或真實 AI provider；無 migration、無新增環境參數、未 push。

### 最終 production build 比較

同一測量腳本，數字為 bytes；下降比例以逐檔 gzip 加總計算。

| Entry | Q2 JS bytes | Q2 gzip bytes | gzip 較基準 |
| --- | ---: | ---: | ---: |
| AppShell | 329502 | 108794 | -35.5% |
| trips | 306003 | 99107 | -14.9% |
| trips/[id] | 898513 | 282675 | -8.0% |
| trips/[id]/album | 479368 | 156004 | -12.3% |
| trips/[id]/expenses | 504062 | 163650 | -6.4% |

這是入口依賴的靜態量測，並非總下載量；開啟功能會再下載所需 chunks，共用依賴仍可能由其他可見功能載入。
AppShell entry 已確認不包含快速記帳建立流程事件、AI 文字欄位與文字解析 API 的程式字串。
真實冷／熱、mobile、PWA service worker、Network／Performance trace 與正式站長尾驗收留在 Q3；
不將這次 bundle 減量宣稱為 LCP／INP 改善。

## Q3 第一階段：支出搜尋（已完成）

- 搜尋欄維持即時 controlled value；篩選結果使用 useDeferredValue，舊結果以 aria-busy 與透明度標示。
- memo 列表邊界隔離篩選／分組／rows，並穩定編輯、刪除 callback 與缺少行程日的空陣列參照。
- 篩選完成才重設 20 筆漸進列表；保留展開狀態、完整資料匯出與 ID 對應，不新增搜尋網路請求。
- React Profiler 回歸驗證輸入先提交、舊列表 busy、後續結果正確；另驗證顯示更多、清除、無結果與操作 ID。
- 23 項相關測試、lint、Prettier、TypeScript 通過。Q3 分階段 WIP，最終交付才更新一次版本。

## Q3 第二階段：預載評估與瀏覽器量測工具（已完成）

- 新增 `pnpm perf:query-ux`，production build、固定匿名 DTO 與隔離 loopback server；
  desktop／mobile／service worker，首頁／支出，cold／warm 各 3 筆，共 36 次載入。
- 保留 Network、Playwright trace、Chrome Performance timeline、LCP／long tasks／輸入 rAF 與 build ID。
- 預載、server hydration、cursor pagination 決策及重跑方式見 [QUERY_UX_PERFORMANCE.md](./QUERY_UX_PERFORMANCE.md)。
- 舊 Q2 build 完整基準跑出 2 次 warm 首頁 hydration error（mobile／worker），工具正確返回失敗，
  不列為綠色驗收。初期工具校正的 SW 禁用錯誤、被拒絕的匿名未讀數請求不納入正式比較。
- 首頁 cold 只有 landing GET；支出 cold 為 5 個 DTO GET；warm 不重抓這些 fresh DTO。
  另有匿名 current-user／通知未讀數 POST，分開記錄，不誤稱所有請求都消失。
- 本階段為測量工具／ADR 與 dev dependency，Q3 版本仍留最終修復交付更新。

## Q3 第三階段：hydration 修復與最終交付（完成）

- 首頁與支出頁新增 ClientQueryBoundary：SSR／首次 hydration 固定 skeleton，之後才 mount client-only query content。
  保留伺服器輸出的全域／旅程導覽，不清掉 IndexedDB 或樂觀快取，不新增資料 API。
- Trip Shell 原本只保護名稱；補上 query feedback 與會員專屬導覽／預算，避免 persisted data 在 selective hydration 前完成而改變 SSR markup。
- 新增快取提前完成後 hydrateRoot 的無 recoverable error 回歸、快取更新仍顯示，以及 Shell 訪客／會員兩種情境。
- 最終 production build 通過；36 次隔離 browser 載入全部成功（desktop／mobile／worker × 首頁／支出 × cold／warm × 3），
  沒有 page error 或未預期 API／寫入。結果、日期／Chrome 版本差異與未改善指標均記入 [效能報告](./QUERY_UX_PERFORMANCE.md)。
- 最終 lint（無警告）、Prettier、TypeScript、production build 通過；全套 **1,375 通過、37 項 opt-in 跳過**。
- Q3 全部交付只在此階段 bump patch 一次；不 push／部署，不需要 migration 或新增 .env 參數。

Q1～Q3 程式與本機工程驗收完成。正式帳號資料、Vercel／Atlas 長尾、實機安裝 PWA／iOS 與真實 CWV
仍屬部署後驗收，不能以這次合成資料宣稱通過；AI 真實品質驗收依原要求仍不做。
