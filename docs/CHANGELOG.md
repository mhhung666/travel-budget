# 完成紀錄（Changelog）

> 本檔是**已完成工作的單一紀錄簿**——功能、改善、重構做完就在此加一筆，不再堆進 ROADMAP / IMPROVEMENTS。
> 各項只留「做了什麼 + 何時 + 指向現況文件的連結」；**實作細節與取捨的權威來源是 [FEATURES.md](./FEATURES.md) / [ARCHITECTURE.md](./ARCHITECTURE.md)**，原始規劃草圖查本 repo 的 git 歷史。
>
> **慣例**：完成一項工作 → 在對應區塊加一行（日期、標題、一句說明）；若是新功能，其實作筆記同時寫進 FEATURES.md，並把 ROADMAP.md 該項刪掉。**尚未動工**的留在 [ROADMAP.md](./ROADMAP.md)（產品功能）與 [IMPROVEMENTS.md](./IMPROVEMENTS.md)（技術債）。

---

## 產品功能（Roadmap #1–#18）

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
| 13 | ⭐ 群組統計（全團視角） | M | 2026-06-26 |
| 15 | 🔹 年度旅行回顧（Travel Wrapped） | M | 2026-06-29 |
| 16 | 🔹 地圖統計儀表板（造訪國城 + 航段里程；choropleth）※ 相片釘點見 ROADMAP #16 | S~M | 2026-07-01 |
| 17 | 🔹 支出搜尋 / 篩選 / 漸進渲染 | S | 2026-06-28 |
| 18 | 🔹 自訂分類 / 標籤 (Custom tags) | S | 2026-07-01 |

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

---

## 程式碼 / 基礎設施改善

早期 P0–P3（#1–#12，含 `withAuth`、env 驗證、proxy 路由保護、Public API hash_code 強化、React Query、頁面拆分、刪除確認 / Skeleton / i18n toast）皆已完成，紀錄見 git 歷史。以下為後續驗證過的項目：

- **CI workflow**（2026-07-02）：新增 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，PR / push master 觸發 `lint` → `format:check` → `test:run` → `build`（帶 dummy env、`concurrency` 取消舊跑）。前置：一次性 `pnpm format` 全庫（107 檔）。
- **Public API 錯誤碼統一**（2026-07-02）：新增 [publicApiError.ts](../src/lib/publicApiError.ts) 結構化錯誤碼，8 條公開路由改回傳 `{ error: <code> }`；link/convert dialog 與頁面改以錯誤碼對應 i18n（新增 `member.convertVirtual.errors.*` 四語）。
- **Public API 樣板收斂**（2026-07-02）：[withPublicTrip.ts](../src/lib/withPublicTrip.ts) 統一 `await params` / hash_code 解析 / 404 / try-catch；[dto.ts](../src/lib/dto.ts) 抽出 `toExpenseDto` / `toTripDto` 供 actions 與公開路由共用（消除平行 DTO 映射）。
- **結構化 logger**（2026-07-02）：新增 [logger.ts](../src/lib/logger.ts)（isomorphic，production 每筆一行 JSON）；全庫 45 處 `console.error` 改用之。
- **安全標頭**（2026-07-02）：[next.config.ts](../next.config.ts) `headers()` 加 `X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` / `frame-ancestors 'none'`，production 才送 HSTS。（完整 `script-src` CSP 刻意未上，見 IMPROVEMENTS.md 備註）
- **路由保護清單單一來源化**（2026-07-02）：`PROTECTED_ROUTES` / `AUTH_ROUTES`（[routes.ts](../src/constants/routes.ts)）修正為與 proxy 一致並被 [proxy.ts](../src/proxy.ts) import，刪除漂移的重複清單。

---

## Supabase（PostgreSQL）→ MongoDB 遷移（2026-06-16 起）

把 6 張關聯表收斂為 **11 個 Mongoose collection**，用內嵌（`Trip.members[]`、`Expense.splits[]`）消除大部分 join 與 N+1。主要改動：主鍵 `number → ObjectId 字串`（JWT / DTO / 前端 props 一致）；`tripIdOrCode` 分流由 `/^\d+$/` 改 `isValidObjectId`；PostgREST 巢狀 select → Mongoose `populate` / 內嵌；`ON DELETE CASCADE` → app 端手動 cascade；serverless 連線走 [mongodb.ts](../src/lib/mongodb.ts) 全域快取；移除 `@supabase/supabase-js` 與前端暴露的 anon key（改用無 `NEXT_PUBLIC_` 前綴的 `MONGODB_URI`）。當前資料模型與慣例見 [ARCHITECTURE.md](./ARCHITECTURE.md) §5–6。
