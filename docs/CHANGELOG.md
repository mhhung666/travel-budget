# 完成紀錄（Changelog）

> 本檔是**已完成工作的單一紀錄簿**——功能、改善、重構做完就在此加一筆，不再堆進 ROADMAP / IMPROVEMENTS。
> 各項只留「做了什麼 + 何時 + 指向現況文件的連結」；**實作細節與取捨的權威來源是 [FEATURES.md](./FEATURES.md) / [ARCHITECTURE.md](./ARCHITECTURE.md)**，原始規劃草圖查本 repo 的 git 歷史。
>
> **慣例**：完成一項工作 → 在對應區塊加一行（日期、標題、一句說明）；若是新功能，其實作筆記同時寫進 FEATURES.md，並把 ROADMAP.md 該項刪掉。**尚未動工**的留在 [ROADMAP.md](./ROADMAP.md)（產品功能）與 [IMPROVEMENTS.md](./IMPROVEMENTS.md)（技術債）。

---

## 產品功能（Roadmap #1–#19）

實作細節見 [FEATURES.md](./FEATURES.md) 對應章節。

| # | 功能 | 成本 | 完成 |
| --- | --- | --- | --- |
| 1 | 💎 預算編列與「預算 vs 實際」 | M | 2026-06-26 |
| 2 | 💎 結算閉環：標記「已付清」 | M | 2026-06-26 |
| 3 | ⭐ 彈性分帳（均分 / 金額 / 百分比 / 份數） | M | 2026-06-26 |
| 4 | ⭐ 收據照片 / 附件（Cloudflare R2） | L | 2026-06-27 |
| 5 | ⭐ 離線優先 PWA（讀取 + 支出建立寫入） | L | 2026-06-28 |
| 6 | ⭐ 行程強化（活動時間軸 + 支出連結 + 票券 / 按天聚合） | M | 2026-06-27 |
| 7 | 🔹 打包清單 / 待辦 | S | 2026-06-26 |
| 8 | ⭐ 動態牆（活動紀錄、per-trip 共享時間軸） | M | 2026-06-28 |
| 9 | ⭐ 通知（站內 + Email + 排程 + Web Push） | L | 2026-06-29 |
| 10 | 🔹 支出留言 (Comments) | M | 2026-07-01 |
| 11 | 🔹 頭像（R2 公開 bucket）※ OAuth 部分見 ROADMAP #11b | M | 2026-06-27 |
| 12 | ⭐ 好友系統（雙向好友 + 通知整合 + 從好友匯入旅程；邀請連結 / 帳號搜尋評估後不做） | M | 2026-07-03 |
| 13 | ⭐ 群組統計（全團視角） | M | 2026-06-26 |
| 15 | 🔹 年度旅行回顧（Travel Wrapped） | M | 2026-06-29 |
| 16 | 🔹 地圖統計儀表板（造訪國城 + 航段里程；choropleth）+ 相片釘點（收據圖片依行程日座標釘點） | M | 2026-07-03 |
| 17 | 🔹 支出搜尋 / 篩選 / 漸進渲染 | S | 2026-06-28 |
| 18 | 🔹 自訂分類 / 標籤 (Custom tags) | S | 2026-07-01 |
| 19 | 💎 旅行成就與收藏 P1（航空/機場固定目錄＋飯店品牌牆＋user-level 終身紀錄＋/collections 頁） | L | 2026-07-13 |
| 19 | 💎 旅行成就 P2（行程活動一鍵帶入＋地圖「飛行」模式航段弧＋wrapped 成就區塊） | M | 2026-07-13 |
| 19 | 💎 旅行成就 P3（里程碑徽章 15 枚＋去識別化公開分享卡串 mapShareCode＋wrapped 年份納入回填；#19 全部完成） | M | 2026-07-13 |
| ＋ | 🔹 行程隨手記（成員共享速記 + 照片附件 + 一鍵轉行程活動；非 Roadmap 項） | S~M | 2026-07-03 |
| ＋ | 🔹 旅程幣別設定（常用幣別 / 自訂匯率 / 預設幣別；支出表單、結算、統計套用；非 Roadmap 項） | S~M | 2026-07-05 |
| #20 | ⭐ 會籍積分與里程紀錄 Phase 1（國泰 MVP：帳戶＋積分 ledger＋升等/續會進度＋飛行帶入；實作筆記見 [FEATURES.md](./FEATURES.md) §16） | M | 2026-07-14 |
| #20 | ⭐ 會籍 Phase 2a（長榮 BR：`milesAndSegments` 哩程＋航段制、滾動 12 月雙路徑升等進度、多 program 編排＋航空/飯店雙 tab；補記） | S | 2026-07-15 |
| #20 | ⭐ 會籍 Phase 3（CX 積分預估：官方 2025/8/20 賺取表常數＋距離區間×客艙 min–max、飛行帶入預估 chip、獨立試算器）＋每計畫 collapse 化（收合列＝名稱/等級/迷你進度） | S | 2026-07-15 |
| #20 | ⭐ 會籍 Phase 2b（華航 CI 2026 新制：滾動 12 月升等＋2 年效期續卡＋50% 自家占比警示；BR 續卡精算＝卡籍效期窗口 40k/42・80k/80・200k/140；`tier_expires_at` 端到端；**#20 全部完成**，PLAN-LOYALTY.md 退役刪除、草圖查 git 歷史） | S | 2026-07-16 |
| #21 | 💎 旅程相簿 Phase 1（相簿本體：`Photo` collection＋成員共享 grid/lightbox/下載；**JPEG `preserveExif` 保住相片 EXIF 含 GPS**＋另抽一份進 DB；`presignGetStable` 窗口對齊簽名；實作筆記見 [FEATURES.md](./FEATURES.md) §17） | M | 2026-07-15 |
| #21 | 💎 旅程相簿 Phase 2（行程日關聯——**無 GPS 的相片借當天座標**標 `source: 'itinerary'`，exif/manual 不被覆蓋；說明編輯；批次選取刪除（`deletePhoto` → `deletePhotos`）；行程日卡片顯示當天相片；刪／改行程日時同步清理借出的座標；實作筆記見 [FEATURES.md](./FEATURES.md) §17） | S | 2026-07-15 |
| #21 | 💎 旅程相簿 Phase 3＋4（**地圖整合**：相片圖層改讀 `Photo`、EXIF 精確釘點、前端 cluster、**退役收據衍生相片模式**；**公開分享**：`Trip.albumShareCode`＋純相片牌公開頁 `/album/share/[code]`——只露相片／說明／日期／旅程名，**不含位置**；公開路由只簽剝除 APP1 的消毒副本 `_p.jpg`（[jpegSanitize.ts](../src/lib/jpegSanitize.ts)／[photoSanitize.ts](../src/lib/photoSanitize.ts)）與縮圖，絕不簽自帶 GPS 的顯示檔） | M | 2026-07-15 |
| #21 | 💎 旅程相簿結案（真機驗收通過：iOS 選 HEIC 自動轉 JPEG、下載回手機 Apple 照片讀得到地點；上線後打磨＝顯示檔升 8MP、地圖釘點縮圖卡片＋50m 距離分群＋最大縮放點 cluster 直開整組 gallery；PLAN-PHOTOS.md 退役刪除，草圖查 git 歷史。可選延伸（封面／zip／Year in Review／`place` 回填）記 ROADMAP #21） | S | 2026-07-16 |

**橫向基礎設施**：Blob 儲存（Cloudflare R2，私有收據 + 公開頭像）、Email / 排程（Resend + Vercel Cron）、即時 / 推播（Web Push VAPID，共用離線 SW）。

---

## 前端重構（UI/UX Redesign，Phase 0–4，2026-07-02）

把「功能逐一疊加」長出來的前端收斂為 **App Shell + 底部導覽 + 行程分頁化 + 設計 Token 化**。所有 Phase 都**不動 Server Actions / 資料層 / route URL**（深連結、通知 email 連結不受影響）。

- **Phase 0｜止血**：刪死碼（`ExpenseCard` / `ExpenseList` / `ExpenseForm`，−584 行）；i18n 漏網（16 處硬編碼 `Error`、`Day N`、`NT$` 金額改走 `formatCurrency`）；Toast 加 `success` 變體；深色 `theme-color` 對齊背景 token；manifest 中文化 + shortcuts；支出卡操作按鈕觸控目標拉到 44px。
- **Phase 1｜App Shell + 導覽**：route groups `(marketing)`/`(auth)`/`(app)`/`(public)`/`(share)`（**URL 全不變**）；`(app)/layout.tsx` server 端取 session、未登入 redirect、`user` 一次注入 [AppShell](../src/components/layout/AppShell.tsx)（刪 19 處 user 映射與 `pt-24` 魔術數字）；桌機頂列導覽 + 行動 [BottomTabBar](../src/components/layout/BottomTabBar.tsx)（safe-area）；漢堡選單刪除；`ErrorState` / `loading.tsx` / `error.tsx` 統一。
- **Phase 2｜行程空間分頁化**（價值最高）：`trips/[id]/layout.tsx` 掛 [TripSpaceShell](../src/components/trips/space/TripSpaceShell.tsx)（掛載一次、換分頁不重繪）取代原本 7 顆彩色入口按鈕；常駐預算摘要條；行程內 FAB（新增支出）；支出列表依日期分組、單行摘要 + 點擊展開（[ExpenseListItem](../src/components/trips/detail/ExpenseListItem.tsx)）；移除主內容 Collapsible。
- **Phase 3｜設計 Token 與品牌**：teal 品牌主色 + `success`/`warning`/`info` 語意色 + 品牌漸層 token（[globals.css](../src/app/globals.css)）；全站 30+ 處散裝調色盤色歸零，ESLint `no-restricted-syntax` 防再犯；字級三級制 + 金額 `tabular-nums` + Inter 接上 `font-sans`；通用 [EmptyState](../src/components/common/EmptyState.tsx)。
- **Phase 4｜高頻流程重製**：[ResponsiveFormSheet](../src/components/common/ResponsiveFormSheet.tsx)（md+ Dialog / 行動端全螢幕 Sheet）；支出表單 701 行拆解為 [expense-form/](../src/components/trips/detail/expense-form/)（金額→描述→分類→送出，其餘進「進階」折疊）；結算頁「以我為中心」hero；`/settings` 588 行拆為列表選單 + 4 子頁；SW 更新提示 [SwUpdateToast](../src/components/pwa/SwUpdateToast.tsx)；`/trips` 移除假 Card + 進行中行程置頂 + FAB；manifest「記一筆」quick-add 捷徑。
- **補完**：[CreateTripDialog](../src/components/trips/CreateTripDialog.tsx) 改用 `ResponsiveFormSheet`；iOS Safari `<input type="date">` 空值顯示全域修正。

**遺留（未做）**：manifest `screenshots` 待素材；`/trips` 封面卡的成員頭像堆疊 / 預算進度需資料層支援；[EditTripDialog](../src/components/trips/detail/dialogs/EditTripDialog.tsx) 與 [JoinTripDialog](../src/components/trips/JoinTripDialog.tsx) 仍為舊置中 Dialog，待用同一套 Sheet 改法處理。

### UI/UX 第二輪 Phase 1A：金額信任與日期基線（2026-07-27）

- 支出表單收合時仍直接顯示「付款人／本地日期／分帳人數與每人金額／外幣換算」；外幣匯率未載入時不再用 `1.0` 或沿用前一個幣別靜默送出，需取得或手動輸入有效匯率。
- 新增共用本地日期輸入工具，修正 UTC+ 時區凌晨的「今天」可能落到前一天；支出、統計日期區間、飛行／住宿／會籍補登共同套用。
- 結算、分帳與摘要統一走 `formatCurrency`，TWD 顯示 `NT$`、不再使用裸 `$`；補日期／幣別單元測試。
- 核心表單補可見 focus、表單描述、四語 accessible name 與 44px 進階操作目標。完整評估與後續 Phase 見 [UI_UX_EVALUATION.md](./UI_UX_EVALUATION.md)。

---

## 行程空間分頁重排（2026-07-15）

七顆並列分頁收斂為 **行程／支出／相簿／結算** 四顆 + 子分頁列（隨手記／清單歸「行程」，統計歸「結算」）。現況見 [ARCHITECTURE.md §4.14](./ARCHITECTURE.md)。

- **落點改為行程分頁**：`/trips/[id]` = 行程，支出移到 `/trips/[id]/expenses`（**與 Phase 0–4 不同，此次動到 route URL**）。其餘子頁 URL 不變；舊 `/trips/[id]/itinerary` 由 [next.config.ts](../next.config.ts) `redirects()` 308 轉回落點（頁面內 `redirect()` 在 App Router 會軟導向、網址列不變，故不採用）。
- **旅行資訊卡**移到行程分頁；編輯流程抽成 [useEditTrip](../src/hooks/useEditTrip.ts) 供兩處共用（原長在 `useTripDetailPage`）。
- **「新增支出」FAB 只在支出分頁**（原本行程空間內永遠在場）。
- **深連結對齊新落點**：支出語意的站內通知 / Web Push / Email（含支出摘要信）與 PWA quick-add 改指 `/expenses`，還款維持 `/settlement`，旅程層級維持落點；`revalidatePath` 一併對齊。
- 驗證：`pnpm test:run`（593 passed，webpush / emailTemplates 斷言依新導向更新）+ 本機實跑逐分頁確認分頁順序、子分頁、資訊卡與 FAB 範圍。

---

## 清單 & 隨手記 重新設計（2026-07-03）

回應使用者回饋（清單「不實用、指派意義不明」、隨手記「排版醜」）。實作細節見 [FEATURES.md](./FEATURES.md) §6 / §14。

- **清單**：從「通用多清單」變成「旅行情境清單」——加類型 `kind`（待辦 / 行李 / 購物，行為隨類型走）、範本選擇器 + 跨旅程複製解冷啟動、行李清單改 **per-member 勾選**（`doneBy[]`）、指派改頭像 chip 收進 ⋯ 選單（僅待辦顯示）、購物項勾完浮出「**記一筆**」帶品名開支出、完成項自動沉底。附 [migration 20260703133143](../migrations/20260703133143-checklist-kind-and-per-member-done.js)（`kind` + `done→doneBy` backfill，部署前各環境先 `pnpm migrate:up`）。
- **隨手記**：composer 收成單一卡片（上傳器不再常駐 + 貼上即傳）、內文 URL `linkify`、卡片版面 / 縮圖放大、修 `intlLocale` `zh→zh-TW`（全站相對時間繁中不再顯示簡體）。**不動資料層**。

---

## 隨手記 Markdown 筆記化（2026-07-14）

回應使用者回饋（「500 字不夠當筆記」「長筆記整篇攤開太佔版面」）。實作細節見 [FEATURES.md](./FEATURES.md) §14。

- 內文升級 **GFM Markdown**（上限 500 → 10,000 字）＋ `remark-breaks` 保持舊純文字顯示相容（**零遷移**）；長筆記摺疊成「首行標題＋兩行摘要」點擊展開；`- [ ]` 待辦可直接在卡片打勾存回（`updateNote` 改 optimistic）；編輯 Dialog 加編輯/預覽 tabs；`planNote` 標題自動去 Markdown 語法。`linkifyText` 退役（GFM autolink 取代）。延伸點子（#標籤、筆記搜尋、記一筆連結、複製匯出）記在 [ROADMAP.md](./ROADMAP.md)。

---

## 程式碼 / 基礎設施改善

早期 P0–P3（#1–#12，含 `withAuth`、env 驗證、proxy 路由保護、Public API hash_code 強化、React Query、頁面拆分、刪除確認 / Skeleton / i18n toast）皆已完成，紀錄見 git 歷史。以下為後續驗證過的項目：

- **CI workflow**（2026-07-02）：新增 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，PR / push master 觸發 `lint` → `format:check` → `test:run` → `build`（帶 dummy env、`concurrency` 取消舊跑）。前置：一次性 `pnpm format` 全庫（107 檔）。
- **Public API 錯誤碼統一**（2026-07-02）：新增 [publicApiError.ts](../src/lib/publicApiError.ts) 結構化錯誤碼，8 條公開路由改回傳 `{ error: <code> }`；link/convert dialog 與頁面改以錯誤碼對應 i18n（新增 `member.convertVirtual.errors.*` 四語）。
- **Public API 樣板收斂**（2026-07-02）：[withPublicTrip.ts](../src/lib/withPublicTrip.ts) 統一 `await params` / hash_code 解析 / 404 / try-catch；[dto.ts](../src/lib/dto.ts) 抽出 `toExpenseDto` / `toTripDto` 供 actions 與公開路由共用（消除平行 DTO 映射）。
- **結構化 logger**（2026-07-02）：新增 [logger.ts](../src/lib/logger.ts)（isomorphic，production 每筆一行 JSON）；全庫 45 處 `console.error` 改用之。
- **安全標頭**（2026-07-02）：[next.config.ts](../next.config.ts) `headers()` 加 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `frame-ancestors 'none'`，production 才送 HSTS。（完整 `script-src` CSP 刻意未上，見 IMPROVEMENTS.md 備註）
- **會籍等級 tag 卡面色**（2026-07-18）：`/memberships` 的 tier badge 底色改用各航官方會員卡近似色（CX/CI/BR 全計畫），色值集中 `TIER_BADGE_COLORS`（[constants/loyalty.ts](../src/constants/loyalty.ts)），取色與維護規則制定於 [TIER-COLORS.md](./TIER-COLORS.md)。
- **路由保護清單單一來源化**（2026-07-02）：`PROTECTED_ROUTES` / `AUTH_ROUTES`（[routes.ts](../src/constants/routes.ts)）修正為與 proxy 一致並被 [proxy.ts](../src/proxy.ts) import，刪除漂移的重複清單。

---

## Supabase（PostgreSQL）→ MongoDB 遷移（2026-06-16 起）

把 6 張關聯表收斂為 **11 個 Mongoose collection**，用內嵌（`Trip.members[]`、`Expense.splits[]`）消除大部分 join 與 N+1。主要改動：主鍵 `number → ObjectId 字串`（JWT / DTO / 前端 props 一致）；`tripIdOrCode` 分流由 `/^\d+$/` 改 `isValidObjectId`；PostgREST 巢狀 select → Mongoose `populate` / 內嵌；`ON DELETE CASCADE` → app 端手動 cascade；serverless 連線走 [mongodb.ts](../src/lib/mongodb.ts) 全域快取；移除 `@supabase/supabase-js` 與前端暴露的 anon key（改用無 `NEXT_PUBLIC_` 前綴的 `MONGODB_URI`）。當前資料模型與慣例見 [ARCHITECTURE.md](./ARCHITECTURE.md) §5–6。
