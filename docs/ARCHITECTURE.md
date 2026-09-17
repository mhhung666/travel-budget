# 架構摘要

本頁保留理解現有功能所需的結構。產品能力見 [FEATURES.md](FEATURES.md)，安裝與環境設定見 [專案 README](../README.md)。

## 核心資料流

Next.js App Router 與 React 組成介面，TanStack Query 負責查詢、重新整理及瀏覽器快取。主要業務操作透過 Server Actions，資料由 Mongoose 存入 MongoDB；API routes 另處理 AI 草稿、公開分享、匯率與排程等入口。

| 程式位置 | 職責 |
| --- | --- |
| [src/app](../src/app/) | 頁面、路由與 API |
| [src/components](../src/components/) | 旅程、支出、統計、相簿等介面 |
| [src/actions](../src/actions/) | 業務操作、授權與資料寫入 |
| [src/hooks](../src/hooks/) | 表單協調、查詢與快取更新 |
| [src/models](../src/models/) | 帳號、旅程、支出、還款及其他資料模型 |
| [src/lib](../src/lib/) | 分帳、權限、儲存、通知、AI 與離線同步 |
| [src/i18n](../src/i18n/) | 繁中、簡中、英文、日文 |
| [migrations](../migrations/) | 資料結構、索引與回填遷移 |

## 主要資料關係

- **旅程**：包含成員、角色、幣別設定及每位成員的私人預算；行程日、支出、還款、相簿、清單與筆記歸屬旅程。
- **支出與結算**：支出記錄付款人、原幣、匯率與各成員分攤金額；結算依餘額與已登記還款產生轉帳建議，基準幣為 TWD。
- **個人資料**：統計彙整個人分攤；飛行與住宿紀錄屬於使用者，刪除旅程只解除終身紀錄的旅程關聯。
- **檔案**：收據、票券及相簿透過 R2 儲存，資料庫保存物件 key；公開相簿使用移除位置資訊的獨立副本。

## 維護時必須保留的契約

- JWT 搭配 httpOnly cookie 驗證身分。每個旅程操作自行檢查成員與角色；Server Actions 回傳 `ActionResult<T>`，輸入由 Zod 驗證。
- 公開分享採獨立資料邊界：不輸出私人預算、收據或成員限定筆記；公開相簿不輸出位置、EXIF 或內部 key。
- 行程與跨資料集合的寫入使用交易及衝突檢查，需要支援交易的 MongoDB replica set 或 sharded cluster。刪除相關資料須明確處理，外部檔案清理由持久化工作補送。
- AI 只產生可編輯草稿，使用者確認後才走既有寫入流程；行程匯入限 admin，支出草稿限成員。三種 AI 入口共用每日使用量及成本限制；模型設定、格式相容性與正規化入口見 [AI 維護與測試](AI.md)。
- Service worker 快取頁面與資源；查詢快取及離線新增支出保存於 IndexedDB。不可快取 Server Action POST 或 API 寫入；改變持久化快取格式時須更新 `PERSIST_BUSTER`。
- 新增介面字串須補齊四語。路由不帶語系前綴，路徑使用 [routes.ts](../src/constants/routes.ts) 的 builder。
- PWA 需以 `pnpm build`（webpack）及 `pnpm start` 驗證；開發模式不啟用 service worker。

細部設計、資料庫遷移操作與子系統注意事項已收進 [封存索引](archive/README.md)，修改相關子系統時可按需查閱。
