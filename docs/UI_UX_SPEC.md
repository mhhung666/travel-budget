# UI/UX 實作規格

> 建立日期：2026-07-27
> 適用範圍：登入後 App Shell、旅行空間、表單、金額、空狀態、離線與同步狀態
> 權威實作：共用 UI 元件、`globals.css`、`formatCurrency`、`ResponsiveFormSheet`

本文件將 Phase 1–4 已採用的介面規則整理成可檢查的基線。新增功能應先重用共用元件；若需偏離，PR／commit 說明必須寫出使用情境，而不是另建一套視覺語言。

## 1. 資訊架構

| 層級 | 固定入口 | 規則 |
| --- | --- | --- |
| 全域主要 | 旅行、地圖、統計、記一筆、我的 | 桌機與行動端名稱、分組一致 |
| 我的 | 旅行成就、會籍、年度回顧、設定 | 低頻個人資料不新增全域主分頁 |
| 旅行主要 | 行程、支出、相簿、結算 | 新功能優先放子頁或「更多」 |
| 行程子頁 | 每日行程、隨手記、清單 | 不與主分頁重複命名 |
| 結算子頁 | 結算方案、群組統計 | 保留既有 URL 深連結 |

全域快速記帳不得依賴目前所在頁面。沒有旅行時必須維持「建立旅行 → 第一筆支出」的連續流程。

## 2. Layout 與 surface

| 元素 | 規格 |
| --- | --- |
| 頁面容器 | 一般內容 `container mx-auto px-4`；依資料密度使用 `max-w-2xl`、`max-w-3xl`、`max-w-4xl` 或 `max-w-6xl` |
| 頁面區塊間距 | 行動端 16px 起；大型區塊 24px；避免用空 Card 製造間距 |
| Control radius | `rounded-md`，由 Button／Input 等共用元件提供 |
| Card radius | `rounded-xl`，一般內容用 `Card` |
| Modal radius | 桌機 Dialog 使用 `sm:rounded-lg`；行動表單為 100dvh bottom Sheet、不加假卡片圓角 |
| Flat surface | 頁面底色 `background`，不加陰影 |
| Raised surface | `Card` 的 border + shadow；卡片內避免再包同重量 Card |
| Overlay surface | Dialog／Sheet overlay；floating nav 使用半透明背景與 backdrop blur |
| Safe area | 行動頂列、底部導覽、表單 footer 必須納入 `env(safe-area-inset-*)` |

旅行 sticky shell 捲動 48px 後進 compact mode。支出、結算、群組統計保留金額摘要；行程、隨手記、清單、相簿可收起摘要，讓主內容更早進入首屏。

## 3. 操作與可及性

- 所有共用 Button、Input、Select、Toggle、Tabs 與選單操作目標至少 44 × 44px。
- 鍵盤焦點使用 2px `focus-visible` ring 與 offset，不以移除 outline 取代。
- Icon-only control 必須有 `aria-label`、`aria-labelledby`、`sr-only` 文字或具意義的圖片 alt。
- Dialog／Sheet 必須有 title 與 description；開啟後聚焦內容、關閉後回到觸發點。
- 非必要動畫遵守 `prefers-reduced-motion`。
- 自動化 axe 在 jsdom 檢查 serious／critical；色彩對比、縮放、螢幕閱讀器與真實 viewport 仍需瀏覽器／裝置驗證。

## 4. 表單與回饋

- 主要任務欄位先出現，低頻欄位漸進揭露。新增支出順序固定為「金額 → 描述 → 分類 → 核對摘要 → 送出」。
- 行動端長表單使用 `ResponsiveFormSheet` 100dvh Sheet，送出鍵固定於 safe-area footer；桌機使用 Dialog。
- 送出期間停用重複提交並顯示 loading；成功用 toast，欄位問題留在表單內，破壞性動作先確認。
- 錯誤訊息回答「發生什麼」與「現在能做什麼」，不得只顯示 `Error` 或內部錯誤堆疊。

## 5. 金額與日期

- 金額一律使用 `formatCurrency`；不得用裸 `$` 表示 TWD。
- 原幣與基準幣同時存在時，原幣為主、約當 TWD 為輔；估算值使用「約」的語意。
- 金額輸入只接受十進位格式；拒絕正負號、科學記號、Infinity 與多個小數點。
- 支出送出前至少顯示付款人、當地日期、分攤人數、每人金額；外幣需顯示換算結果。
- 日期輸入預設走本地日曆日 helper，不用 UTC `toISOString()` 截字串。
- 顯示日期必須明確套 UI locale；日期區間統一使用 `–`。

## 6. 空狀態

每個空狀態至少包含：

1. 簡短標題：目前為什麼沒有內容。
2. 一句結果導向說明：完成後能得到什麼。
3. 可執行 CTA：直接開啟主要流程。

搜尋無結果提供清除篩選；權限不足時不展示無法完成的 CTA。圖示為輔助裝飾，使用 `aria-hidden`，不可取代標題。

## 7. 系統、離線與同步狀態

| 狀態 | 必要回饋 | 行為 |
| --- | --- | --- |
| Loading | Skeleton 或具名稱的 progress/status | 不以空白頁代替 |
| Offline | 全域 `role="status"` banner | 已快取內容仍可讀 |
| Expense queued | 單筆「待同步」標記 + toast | 樂觀插入，不允許編輯／刪除暫存列 |
| Sync success | 一次性成功回饋 | invalidate 支出、結算、統計、活動快取 |
| Sync failed | 明確失敗回饋與後續處理入口 | 不可靜默丟失本地輸入 |
| Destructive pending | 按鈕 loading + 防重複操作 | 完成前保留 Dialog |

集中式「多筆待同步／失敗復原」仍屬後續產品能力；在完成前，不可移除現有 banner、toast 與單筆待同步標記。

## 8. 隱私安全事件

事件只能透過 `navigationEvents.ts` 與 `productEvents.ts` 的固定 taxonomy：

| 事件 | 允許欄位 |
| --- | --- |
| `navigation_used` | 固定 `target`、`surface` |
| `activation_step` | 固定 `step` |
| `quick_add_flow` | 固定 `stage`、`path` |
| `expense_correction` | 固定 `action`、`timing` bucket |
| `offline_expense` | 固定 `state` |

禁止記錄使用者／旅行／支出 id、姓名、旅行名稱、描述、邀請碼、日期、位置、精確金額或自由輸入文字。若分析需要新維度，先擴充 union 與測試，再接觸發點。

## 9. Release 驗收

- 四語 catalog 可解析，新增文案四語齊全。
- `pnpm test:run`、`pnpm lint`、`pnpm format:check`、`npx tsc --noEmit`、`git diff --check` 通過。
- 風險較高的 UI 變更執行 `pnpm build`。
- `pnpm test:a11y` 的關鍵元件 axe 無 serious／critical；真實瀏覽器另檢查 360 × 800、200% zoom、鍵盤、reduced motion 與至少一套螢幕閱讀器。
