# AI 智慧輸入規劃

> 狀態：`in-progress`（Phase 3A／3B 已接入新增支出表單與共用持久化配額；品質基線與產品觀測尚未完成）
> 更新日期：2026-08-10
> 已完成的 AI 行程匯入 Phase 0–2 實作摘要見 [archive/AI_ITINERARY_IMPORT_PHASES_0_2.md](./archive/AI_ITINERARY_IMPORT_PHASES_0_2.md)；目前能力與技術契約分別以 [FEATURES.md](./FEATURES.md) 與 [ARCHITECTURE.md](./ARCHITECTURE.md) 為準。

## 1. 現況與下一步

AI 行程文字匯入已具備結構化解析、可編輯預覽、明確確認、逐日冪等寫入、配額與去敏觀測，目前只開放低流量受限試用。尚未通過的擴流門檻為：

- 完整 31 筆 fixture 的 provider 可用率至少 90%；Free Tier 現有結果為 32.3%。
- 真人計時驗證相較手動建立五天行程至少節省 50%。

下一個產品階段改為智慧記帳，依風險拆開交付：

| Phase | 狀態 | 可交付結果 |
| --- | --- | --- |
| 3A | `in-progress` | 單張收據圖片解析成可編輯支出草稿（API、表單帶入、配額與 route 安全測試完成；尚待品質與產品觀測） |
| 3B | `in-progress` | 單筆自然語言記帳與分攤草稿（API、唯一名稱解析、四種分帳表單帶入完成；尚待 fixture 與品質驗收） |
| 3C | `idea` | 文字與收據合併輸入、重複提示 |
| 4 | `idea` | PDF、多頁、多張、品項辨識與批次能力 |

Phase 3A 可先做，無須等待 Phase 3B 的成員名稱消歧義及比例分攤規則；兩者共用支出草稿正規化、確認卡、AI 配額與觀測邊界。

### 1.1 目前實作快照（2026-08-10）

- `POST /api/ai/receipt-draft` 僅接受旅程成員自己的 JPEG、PNG、WebP 收據 key；會以 R2 實際 metadata 驗證 key、型別與大小後才讀取圖片。它只回傳 schema 驗證與正規化後的草稿，不會建立支出；PDF 仍只能作一般附件。
- `POST /api/ai/expense-text-draft` 只接受旅程成員的單筆文字。未提付款人時預設目前使用者，未提分帳者時預設全員（含虛擬成員）；明示姓名只在 display name 或 username 唯一對應時才解析。均分、指定金額、百分比與份數只有在所有姓名唯一、成員未重複、模型未標記分帳疑義，且金額／百分比合計通過既有分帳平衡規則時，才產生 member-ID based `resolvedSplit` 並帶入表單。其他情形回傳 `requiresCorrection` 與固定 warning，不會靜默套用分帳；仍須由使用者提交既有 `createExpense` 流程。
- 新增支出表單可掃描已上傳的 JPEG、PNG、WebP 收據，並只帶入可唯一確認的商家、總額、幣別、日期與分類；PDF 不顯示掃描入口。缺少／歧義總額或幣別會保留原值並要求使用者修正，掃描本身不會提交支出。
- 兩端點已共用 MongoDB 持久化 global／user／trip 每日配額、成本預留與 token 結算，並具備授權、輸入、附件、配額及 provider 失敗的 route 測試。3B 的四種分帳表單帶入已有確定性測試；產品事件、代名詞規則與 fixture 品質評估仍未完成，因此不得視為一般使用者可用或正式擴流。

## 2. 共通產品原則

- AI 只產生草稿，不直接建立、更新或刪除支出。
- 使用者確認前，所有將寫入的欄位都必須可見且可編輯。
- 模型不得產生或接收 MongoDB ID，也不得取得任何資料寫入 tool。
- 匯率、基準幣金額、四捨五入、分攤尾差與成員歸屬全部由確定性程式處理。
- 確認時一律重用既有 `createExpense`，不得另建繞過權限、附件驗證、通知與活動紀錄的寫入路徑。
- AI 未設定、額度用盡、逾時或輸出無效時，手動記帳與收據附件功能必須維持可用。
- 不保存 AI 對話記憶；不把完整輸入、收據內容或自由文字草稿寫入 log 或分析事件。

## 3. Phase 3A：收據圖片分析

### 3.1 目標與 MVP 範圍

使用者在新增支出時拍攝或選擇一張收據，系統分析後帶入：

- 商家名稱，作為可編輯的支出描述。
- 應付總額；若小計、稅額、服務費與總額無法唯一判定，回傳候選並阻止直接確認。
- ISO 4217 幣別；只有符號而無法唯一判定時標記歧義。
- 消費日期。
- 建議支出分類。
- 原收據附件；分析不另建一份公開檔案。

MVP 不讓模型推測付款人、分帳成員、匯率或最終 TWD 金額。這些欄位沿用現有表單規則並在確認前顯示：目前使用者付款、全員平分、旅程自訂匯率優先，其次即時匯率。

### 3.2 明確不納入 MVP

- PDF、多頁文件與一次多張收據。
- 品項明細、逐項分帳、稅額申報或報帳格式。
- 從卡號、簽名或收據文字推測付款人。
- 自動選擇 subtotal、含稅總額、小費後總額等有歧義的金額。
- 辨識成功後自動入帳。
- 將數字信心分數視為安全判斷；模型自報 confidence 不具校準保證。

目前上傳層仍可接受 PDF，Phase 3A 的「分析」入口必須另外限制為 JPEG、PNG 或 WebP；PDF 維持只能當一般附件。

### 3.3 使用者流程

1. 使用者開啟新增支出並選擇「掃描收據」。
2. 瀏覽器沿用既有 receipt preset 壓縮圖片並直傳私有 R2。
3. `receipt-draft` endpoint 驗證 session、旅程成員身分、物件 key 前綴、實際 content type、大小與配額。
4. 伺服器從 R2 讀取 bytes，交給支援圖片輸入的模型產生結構化草稿；不把短效簽名 URL 當模型輸入。
5. 確定性程式驗證幣別、日期、正數金額與欄位上限，並將歧義轉成固定 warning code。
6. 現有支出表單帶入草稿與附件，使用者修正付款人、分帳、匯率及其他欄位。
7. 使用者明確確認後才呼叫既有 `createExpense`；該 action 再次驗證成員、分帳合計及附件實體。

分析失敗時保留已選圖片與目前表單內容，提供重試及「改用手動輸入」，不得卡住記帳流程。

### 3.4 草稿契約

模型只描述從圖片讀到的語意，不負責資料庫關聯與計算：

```ts
type ReceiptDraft = {
  merchantName?: string;
  transactionDate?: string; // YYYY-MM-DD；無法唯一判定時省略
  currency?: string; // ISO 4217；無法唯一判定時省略
  amountCandidates: Array<{
    kind: 'total' | 'subtotal' | 'tax' | 'service' | 'tip' | 'unknown';
    amount: number;
  }>;
  suggestedCategory?:
    | 'accommodation'
    | 'transportation'
    | 'food'
    | 'shopping'
    | 'entertainment'
    | 'tickets'
    | 'other';
  fieldStatus: {
    merchantName: 'read' | 'missing' | 'ambiguous';
    transactionDate: 'read' | 'missing' | 'ambiguous';
    currency: 'read' | 'missing' | 'ambiguous';
    total: 'read' | 'missing' | 'ambiguous';
  };
  warnings: Array<{
    code: string;
    field?: 'merchantName' | 'transactionDate' | 'currency' | 'total';
  }>;
};
```

正式實作以 Zod 定義並限制陣列與字串長度。`fieldStatus` 用於阻擋與 UI，不採用模型自報的百分比信心值。模型輸出通過 schema 後仍須經正規化，再轉成現有支出表單資料；不得直接傳給 Mongoose 或 `createExpense`。

### 3.5 建議技術邊界

```text
src/app/api/ai/receipt-draft/route.ts
src/lib/ai/receiptDraftSchema.ts
src/lib/ai/receiptDraftPrompt.ts
src/lib/ai/receiptDraftProvider.ts
src/lib/ai/normalizeReceiptDraft.ts
src/lib/ai/expenseDraftLimits.ts
src/components/trips/detail/expense-form/ReceiptScanButton.tsx
src/__fixtures__/ai/receiptDraftFixtures.ts
```

應抽取可共用的 AI provider 錯誤分類與 quota primitive，但不要在 Phase 3A 順便大幅重構已穩定的行程匯入。模型選擇不得寫死在文件；先用 fixture 比較支援圖片輸入的候選模型，再透過伺服器環境設定。

### 3.6 安全、隱私與成本

- endpoint 只要求旅程成員身分，與手動新增支出的權限一致；不可沿用行程匯入的 admin-only 規則。
- key 必須屬於 `receipts/<tripId>/`，且以 `headObject` 驗證實際圖片型別與大小後才能讀取。
- 對模型只傳必要圖片與抽取指令，不傳成員、其他支出、邀請碼、公開分享碼或附件 URL。
- 收據可能含卡號末碼、地址、會員編號與簽名。上線前須確認所選 provider 的資料保留政策符合產品隱私要求。
- 收據上的文字一律視為不可信輸入；模型只能回傳 schema，不能呼叫 tool 或改變系統指令。
- server log 只記 provider、model、latency、token、成本與固定錯誤碼；分析事件只使用固定 stage／result／corrected 欄位。
- 圖片請求須納入 global／user／trip 每日限制與成本預留。Free Tier 429 必須顯示為可重試的容量限制。

### 3.7 Phase 0R 品質基線

實作 UI 前先建立至少 40 份匿名化或合成收據 fixture，涵蓋：

- 繁中、簡中、英文、日文與混合語言。
- TWD、JPY、USD、EUR、HKD、THB，以及只有 `$` 等歧義符號。
- 小計／稅／服務費／折扣／小費／總額同時存在。
- 斜拍、陰影、皺摺、熱感紙淡字、低對比、小字與長條收據。
- 缺日期、缺幣別、手寫金額、刷卡簽單及非收據圖片。
- 含卡號末碼、地址、會員編號的測試內容必須為假資料。

評分至少分開統計：合法 schema、商家、日期、幣別、正確總額、歧義攔截率、provider 可用率、延遲及每張成本。provider 失敗與成功生成後的欄位品質必須分開呈現。

### 3.8 完成條件

- 成功生成的 fixture 100% 通過草稿 schema。
- 商家、日期、幣別與總額在非歧義樣本的欄位正確率各至少 95%。
- 有多個合理總額或幣別無法唯一判定時，至少 95% 被標記為 ambiguous，且不可直接確認。
- 所有寫入都經使用者確認及既有 `createExpense`；越權、跨旅程 key、非圖片、超限、逾時與無效輸出皆零寫入。
- 未設定 AI 或 provider 失敗時，手動記帳與一般收據上傳不受影響。
- 行動端從選圖到可確認草稿的中位時間目標不超過 8 秒；正式門檻以 Phase 0R 實測後定案。
- 四語錯誤、載入、歧義、重試與手動 fallback 文案齊全，並通過鍵盤、焦點與螢幕閱讀器基本驗收。

## 4. Phase 3B：自然語言記帳與分攤

### 4.1 目標範圍

使用者以一句話建立單筆支出草稿，例如：

```text
昨晚計程車 1,200 日圓我先付，Amy 不用出，其他三人平分。
```

模型解析描述、日期、原幣金額、幣別、付款人名稱、參與者名稱、分攤語意、分類、標籤與可選行程日期。程式端負責姓名解析、匯率、基準幣換算與最終 `share_amount`。

模型輸出不得包含 MongoDB ID 或自行算出的最終分攤金額：

```ts
type ExpenseTextDraft = {
  description: string;
  date?: string;
  originalAmount: number;
  currency?: string;
  payerName?: string;
  category?: string;
  tags?: string[];
  itineraryDate?: string;
  split:
    | { method: 'equal'; participantNames: string[] }
    | { method: 'amount'; shares: Array<{ memberName: string; amount: number }> }
    | { method: 'percentage'; shares: Array<{ memberName: string; percentage: number }> }
    | { method: 'ratio'; shares: Array<{ memberName: string; units: number }> };
  warnings: Array<{ code: string }>;
};
```

### 4.2 已定案的預設與仍待實作項目

- 未提付款人時預設目前使用者；使用者明示付款人時才解析指定姓名。
- 未提參與者時預設全員，包含虛擬成員；使用者可在預覽中修正。
- 同名／未知成員不得靠陣列順序自動選擇；必須停在預覽，讓使用者修正。
- 指定金額、百分比與份數已轉成既有表單的 `amount`／`percent`／`shares` 輸入；只有唯一且不重複的成員及平衡合計可自動套用，實際基準幣分攤仍由既有確定性程式計算。
- 「我、我們、其他人」等代名詞的可接受規則。
- 日期超出旅程範圍、幣別缺漏、分攤不符時必須提供修正選項，不能直接寫入。

Phase 3B 開始前須另建至少 30 份支出文字 fixture。付款人、幣別、日期與分攤對象正確率各至少 95%；同名、分攤不符或幣別不明時必須停在預覽，不能寫入。

## 5. Phase 3C 與後續候選

Phase 3A、3B 各自通過觀測門檻後，再評估：

- 同時提供文字與收據，例如以文字補充「我付、Amy 不用分」。
- 依日期、商家、金額、付款人提示可能重複，但不由 AI 自動刪除。
- 一次多筆支出、批次確認與同批撤銷。
- PDF、多頁文件、多張收據與票券輸入。
- 品項抽取與逐項分帳；須先完成 Roadmap 的逐項分帳資料模型。
- 語音輸入、從筆記快速形成支出草稿。

以下仍不做：讓模型自行執行不可逆操作、將資料庫寫入權限交給外部 agent、保存長期 AI 對話記憶，或把本產品擴張成通用旅行規劃聊天機器人。
