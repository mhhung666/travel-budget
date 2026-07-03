# 清單 & 隨手記 重新設計報告

> 2026-07 使用者回饋：**清單**「感覺不實用、指派用途意義不明、整個頁面想不到要怎麼使用」；**隨手記**「UI 排版醜、想更實用」。本文盤點現況、診斷問題、提出重新設計方案與實作優先序。尚未動工，先對齊方向。

---

## 一、清單（Checklist）

### 1.1 現況

- 資料：獨立 [Checklist](../src/models/Checklist.ts) 集合 = `{ trip, title, items[], createdBy }`，item = `{ text, done, assignee }`。
- 頁面 [/trips/[id]/checklists](../src/app/%28app%29/trips/%5Bid%5D/checklists/page.tsx)：頂部一個「新清單名稱」輸入框，下方每份清單一張卡（[ChecklistCard](../src/components/trips/detail/checklist/ChecklistCard.tsx)：標題 + N/M 進度條 + 項目列 + 新增列）。
- 每個項目列（[ChecklistItemRow](../src/components/trips/detail/checklist/ChecklistItemRow.tsx)）= checkbox + 文字 + **常駐的指派下拉（Select）** + hover 刪除鍵。

### 1.2 問題診斷

| # | 問題 | 根因 |
|---|------|------|
| C1 | **冷啟動空白**——進頁面只有一個要你自己發明名字的輸入框，不知道該建什麼 | 沒有範本 / 建議（ROADMAP #7 早已列「清單範本複用」未做），工具是通用的、沒有旅行情境 |
| C2 | **指派意義不明**——每一列都掛一個下拉，顯示成員名（如截圖的 `jwaiting`），看起來像不明所以的狀態文字 | 旅行清單八成是「各帶各的行李」，「指派給某人」只在少數分工項目（如誰帶行動電源、誰去換錢）有意義，卻被做成**每列常駐 UI**，噪音 > 資訊 |
| C3 | **與 app 其他功能零連結**——勾完就結束，感受不到價值 | 購物清單勾完理應能順手記支出；行前待辦理應能提醒；隨手記的點子理應能變成清單項目。目前全部斷開，所以「想不到要怎麼使用它」 |
| C4 | 打包場景下 `done` 是全隊共用的 | 行李是**每個人各自**要帶的，A 勾了「護照」不代表 B 帶了護照；單一 boolean 表達不了 |

### 1.3 重新設計提案

核心思路：**從「通用多清單工具」變成「旅行情境的清單」**——用範本解決冷啟動、用清單類型決定行為、把指派降級成選配。

#### P0-1 建立流程改為範本選擇器

「新增清單」改為開 bottom sheet（比照 [PlanNoteSheet](../src/components/trips/detail/notes/PlanNoteSheet.tsx) 的手感）：

```
┌─ 新增清單 ────────────────────────┐
│ ✈️ 行前待辦   （訂房確認、換匯、保險…）│
│ 🎒 行李打包   （護照、充電器、藥品…） │
│ 🛍️ 購物清單   （伴手禮、代購…）      │
│ 💊 藥品 / 證件（常備藥、影本…）      │
│ ➕ 空白清單                        │
│ 📋 從其他旅程複製…                 │
└──────────────────────────────────┘
```

- 範本 = 前端常數（`src/constants/checklistTemplates.ts`），每個範本帶預設項目，i18n 四語系。選了直接 `createChecklist` + 批次 `addChecklistItem`（或加一個 `createChecklistFromTemplate` action 一趟寫入）。
- 「從其他旅程複製」解掉每次出國都重打一遍的痛（= ROADMAP #7 的範本複用，先做跨旅程複製這半，個人自訂範本留 P2）。

#### P0-2 清單類型 `kind`，行為跟著類型走

`Checklist` 加 `kind: 'todo' | 'packing' | 'shopping'`（預設 `'todo'`，範本自帶類型；需 migrate-mongo backfill 既有文件為 `'todo'`）：

| kind | 勾選語意 | 指派 | 加值行為 |
|------|---------|------|---------|
| `todo` 行前待辦 | 全隊共享（現行為） | ✅ 有意義（分工），保留 | （P1）可掛提醒 |
| `packing` 行李打包 | **每人各自勾**（見下） | ❌ 隱藏 | 顯示「我的進度 3/10」 |
| `shopping` 購物 | 全隊共享 | ❌ 隱藏 | 勾完浮出「記一筆支出」捷徑 |

`packing` 的 per-member 勾選：item 的 `done: Boolean` 改為 `doneBy: ObjectId[]`（勾 = `$addToSet` 自己、取消 = `$pull`；共享清單即「doneBy 非空」，DTO 對舊前端維持 `done` 欄位）。遷移：`done: true → doneBy: [createdBy]`、`false → []`，idempotent + down，見 [MIGRATIONS.md](MIGRATIONS.md) 慣例。`removeMember` 現有的「清 assignee」要一併 `$pull` doneBy。[公開分享路由](../src/app/api/public/trips/%5Bid%5D/checklists/route.ts) DTO 同步。

#### P0-3 指派 UI 重做（回應「意義不明」）

- **未指派 = 什麼都不顯示**（現在每列都渲染一個下拉，是最大噪音源）。
- 已指派 = 一顆小頭像 chip（沿用成員頭像 fallback 首字母），一看就懂「這件事歸誰」。
- 指派操作收進列尾的 `⋯` 選單（順便收編「刪除」，取代現在 hover 才浮現、行動端根本點不到的 X 鍵）。
- 只有 `kind: 'todo'` 顯示這一段。

```
現行：  ☐ 預約白羊              jwaiting ▾   (✕)
改後：  ☐ 預約白羊                    (J) ⋯
        ☐ 2萬 現金                        ⋯      ← 未指派無雜訊
```

#### P1（做完 P0 後的加值）

1. **勾完購物項 → 記支出**：`shopping` 清單項目勾選後浮出 inline 動作「＄記一筆」，帶入品名開支出表單——把清單接上本 app 的核心（記帳）。
2. **項目備註/數量**：item 加選填 `note`（截圖「2萬 現金」其實是數量語意，硬塞在標題裡）。
3. **已完成沉底**：卡片內完成項自動移到底部（純前端排序），進度一目了然。
4. **隨手記 ⇄ 清單**：NoteCard 選單加「轉為清單項目」，與現有 `planNote`（轉行程）對稱——三個功能串成「點子 → 待辦 → 行程」的漏斗。
5. **行前提醒**：清單掛選填 `dueDate`，到期未完成走 [notify()](../src/lib/notify.ts) fan-out（站內 + push，第 5 個觸發點）。

#### P2

- 個人自訂範本（把清單存為「我的範本」，跨旅程）。
- 拖曳排序（items 有 `_id`，加 `order` 或整批覆寫皆可）。

---

## 二、隨手記（Notes）

### 2.1 現況

頁面 [/trips/[id]/notes](../src/app/%28app%29/trips/%5Bid%5D/notes/page.tsx)：頂部 [NoteComposer](../src/components/trips/detail/notes/NoteComposer.tsx)（Textarea + 送出鍵，下方掛 [AttachmentUploader](../src/components/trips/detail/ReceiptAttachments.tsx)），下面 [NoteCard](../src/components/trips/detail/notes/NoteCard.tsx) 列表（釘選優先），已規劃的收進底部摺疊區。

### 2.2 問題診斷

| # | 問題 | 位置 |
|---|------|------|
| N1 | **常駐的孤兒上傳方塊**：輸入框下方永遠掛一顆 64px 虛線方塊（只有一個 upload icon），沒附件時就是一塊突兀的空占位——排版醜的主因 | NoteComposer 直接複用收據表單的 `AttachmentUploader`，那個元件是為「表單裡的附件區」設計的，不適合常駐 composer |
| N2 | **網址裸露、不可點**：內文純文字渲染，長 URL 整段換行撐版面（見截圖 ptt.cc 那則），存了連結卻還要手動複製 | NoteCard 直接 `<p>{note.text}</p>` |
| N3 | **相對時間顯示簡體**：zh-TW 介面下顯示「4小时前」 | [relativeTime.ts](../src/lib/relativeTime.ts) `intlLocale('zh')` 回傳 `zh`，`Intl` 的 `zh` 解析為簡中。**這是 bug，且全站共用**（通知鈴鐺、動態牆同病） |
| N4 | 卡片頂部 pin / badge 那行在無 pin 無 badge 時仍渲染空 `div`，卡片間距不一致 | NoteCard 的 `flex-wrap` 列無條件渲染 |
| N5 | 縮圖 64px 太小，照片是這功能的重點內容卻只有指甲大 | `AttachmentThumb` 沿用收據縮圖尺寸 |

### 2.3 改善提案

#### P0-1 Composer 重排成單一卡片（解 N1）

上傳器不再常駐；圖片入口收成工具列上的一顆 icon 鍵，縮圖只在有附件時出現：

```
現行：                          改後：
┌────────────────┐ ┌──┐        ┌──────────────────────────┐
│ 隨手記一筆...    │ │➤ │        │ 隨手記一筆...              │
└────────────────┘ └──┘        │                          │
┌──┐                           │ [縮圖][縮圖]  ← 有附件才出現 │
│⬆ │   ← 常駐孤兒方塊            ├──────────────────────────┤
└──┘                           │ 📷           0/500    [➤] │
                               └──────────────────────────┘
```

實作：composer 自己管 file input + 沿用同一套上傳流程（壓縮 → `createNoteUploadUrl` presigned PUT → headObject 驗證不變）；`AttachmentUploader` 保持原樣給收據/票券表單用，避免動到支出流程。

#### P0-2 內文 linkify（解 N2）

- 純函式 `linkifyText(text)`（`src/lib/linkify.ts`）：URL 切段轉 `<a target="_blank" rel="noopener noreferrer">`，**顯示截短**（域名 + 路徑 ≤ ~30 字 + …），非 URL 段照舊 `whitespace-pre-wrap`。單元測試涵蓋（多 URL、行首行尾、非 http 不轉）。
- 不做 og 預覽卡（要 server proxy 抓外站，成本/隱私不划算，P2 再議）。

#### P0-3 修 `intlLocale`（解 N3）

`zh → zh-TW`（`jp → ja` 照舊、`zh-CN` 不變）。一行修正 + 測試，全站受益。

#### P0-4 卡片版面微調（解 N4、N5）

- pin 圖示 / 「已規劃 Day N」badge 併入底部 meta 列（作者·時間那行）或卡片右上角，移除無條件渲染的空列。
- 附件縮圖放大：1 張時顯示大圖（max-h ~14rem、cover），多張時 3 欄方格——照片變成內容而不是附註。點開全螢幕檢視沿用現有 Dialog。

#### P1

1. **貼上即傳**：composer 的 `onPaste` 抓 `clipboardData.files` 直接走上傳（行動端截圖 → 貼上，最低摩擦）。
2. **轉為清單項目**：見清單 P1-4，NoteCard 選單加一項。
3. **關鍵字過濾**：筆記多了之後在頂部加一個前端 filter（純 client、不用動 action）。

---

## 三、實作優先序總表

| 順位 | 項目 | 主要改動面 | migration | 估計 | 狀態 |
|------|------|-----------|-----------|------|------|
| 1 | N3 `intlLocale` zh→zh-TW | `src/lib/relativeTime.ts` + 測試 | — | XS（bug fix，可先出） | ✅ 已完成 |
| 2 | N1 Composer 重排 | NoteComposer | — | S | ✅ 已完成 |
| 3 | N2 linkify + N4/N5 卡片版面 | NoteCard、`lib/linkify.ts` + 測試 | — | S | ✅ 已完成 |
| 4 | C1 範本選擇器（含跨旅程複製） | 新常數 + sheet 元件、checklist.actions、i18n ×4 | — | M | ✅ 已完成 |
| 5 | C3/C2 指派 UI 重做（頭像 chip + ⋯ 選單） | ChecklistItemRow | — | S | ✅ 已完成 |
| 6 | C2 `kind` + C4 per-member 勾選 | Checklist model、actions、DTO、公開路由、`removeMember` | ✅ backfill `kind` / `done→doneBy` | M–L | ⏳ 待做（需 migration，獨立 PR） |
| 7 | P1 群（記支出捷徑、note→item、備註、貼上即傳、提醒） | 各自獨立 | — | 各 S–M | ⏳ 待做（貼上即傳已隨項目 2 附帶完成） |

> **2026-07-03 實作進度**：順位 1–5 已於 master 完成（不動資料層），`pnpm lint` / `tsc` / `test:run`（385 passed，含新增 linkify、relativeTime 測試）皆綠。順位 6 動 schema 需 `migrate-mongo`，建議獨立 PR；順位 7 之「貼上即傳」已順手做進 NoteComposer。

備註：

- 所有新字串進 **四份** i18n catalog（en / zh / zh-CN / jp）。
- 6 的 migration 依 [MIGRATIONS.md](MIGRATIONS.md)：idempotent、附 down、部署前各環境先 `pnpm migrate:up`。
- 1–5 完全不動資料層，可先出一批「立即變好看/好用」的改善；6 才動 schema，建議獨立 PR。
