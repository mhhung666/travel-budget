# AI 行程匯入與智慧輸入規劃

> 狀態：`ready`
> 更新日期：2026-08-03
> 本文件定義尚未實作的產品範圍；完成後將現況移至 [FEATURES.md](./FEATURES.md)，架構契約移至 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 1. 產品定位

本功能不是旅行規劃 AI，也不嘗試取代專業的外部 AI agent。使用者先在 ChatGPT、Claude、Gemini 或其他專業 agent 完成旅行規劃，再把結果貼入本系統；本系統負責：

1. 辨識外部輸出的日期、時間、地點、活動、交通、住宿與備註。
2. 將不同格式的內容歸納成本站既有的逐日行程結構。
3. 找出缺漏、衝突與無法確定的欄位。
4. 顯示可編輯的匯入預覽。
5. 由使用者確認後，透過既有 Server Actions 寫入旅程。

同一套基礎能力也用於自然語言快速記帳與分攤，例如「昨天晚餐 3,600 日圓，John 付，我們三個平分」。兩者同屬核心範圍，但分成獨立 Phase 交付，避免行程匯入與金額正確性互相阻塞。

## 2. 為什麼值得做

- 外部 AI 已擅長長篇規劃，不需要在本站重複建造搜尋、推薦與規劃能力。
- 使用者目前仍須把外部結果逐日、逐項複製到行程表，匯入功能能直接消除這段重複工作。
- 本專案已有行程 schema、Zod 驗證、會員權限與 Server Actions，AI 只需負責非結構化文字到草稿的轉換。
- 草稿確認後才寫入，可把模型錯誤限制在可恢復的預覽階段。
- 記帳表單包含付款人、幣別、日期、分類及多人分攤，自然語言能顯著減少旅途中用手機逐欄輸入的摩擦。
- Vercel AI SDK 可將模型供應商封裝在單一邊界，先經 Vercel AI Gateway，未來仍可改為 OpenAI API 直連。

## 3. 範圍

### 3.1 第一階段：外部行程匯入 MVP

支援使用者貼入純文字或 Markdown，內容可包含多天、多個活動。系統應解析：

- 日期或 Day 1、Day 2 等相對日序。
- 活動開始與結束時間。
- 活動名稱與類型。
- 地點的文字名稱。
- 交通、住宿、餐飲、景點與其他活動。
- 一般備註。
- 航班、訂房或票券確認碼，但必須標示為敏感資料並在確認前清楚顯示。

第一階段只匯入新的活動。若目標日期已有行程，預覽中顯示「附加到既有日期」，不得靜默覆蓋原內容。

### 3.2 第二階段：自然語言記帳與分攤

使用者可用一句或一段文字建立支出草稿，系統應解析：

- 消費描述、日期、原幣金額及幣別。
- 付款人與參與分攤的旅程成員。
- 平均分攤、指定金額、百分比或份數比例。
- 支出分類、標籤及可選的關聯行程日。
- 一段文字內的多筆支出；MVP 可先限制單筆，驗證穩定後再開放批次。

例如：

```text
昨晚計程車 1,200 日圓我先付，Amy 不用出，其他三人平分。
```

模型只產生人類可讀的語意草稿；程式端負責把姓名解析為旅程成員 ID、取得適用匯率、計算基準幣金額與每人 `share_amount`，最後再交由既有支出 schema 驗證。AI 不負責最終金額運算。

### 3.3 值得納入的相鄰能力

以下能力能直接重用解析、預覽與確認流程，且比一般聊天功能更貼近旅行中的實際資料輸入：

- **批次匯入與批次撤銷**：同一次確認建立的行程或支出應能辨識為同一批；若結果不符預期，可安全撤銷該批新增內容。需先設計 import batch ID、權限與活動紀錄。
- **重複偵測**：依日期、時間、標題、金額及付款人提示可能重複，但不由 AI 自動刪除。
- **從行程抽取待辦／清單**：把「出發前上網登機、購買車票、準備轉接頭」整理成未勾選的 checklist 草稿，確認後建立。
- **缺漏檢查**：指出行程日期斷層、住宿未涵蓋所有夜晚、交通銜接時間不合理或支出缺少付款人；只提示，不自動改資料。
- **來源摘要**：匯入預覽顯示來源文字的摘要與轉換警告，讓使用者知道哪些內容被忽略或無法對應；不預設長期保存完整原文。

### 3.4 後續候選

- 依使用者明確指示修正既有活動。
- 活動去重、合併與重新排序。
- 刪除行程；必須逐項確認或提供可復原機制。
- 上傳 PDF、圖片或外部分享連結。
- 語音輸入。

### 3.5 明確不做

- 長篇 AI 旅行規劃、景點推薦或網路研究。
- 讓模型自行決定並執行不可逆操作。
- 未經確認直接新增、覆蓋或刪除資料。
- 將資料庫或公開 API 的寫入權限直接交給外部 agent。
- 第一階段保存長期 AI 對話記憶。

## 4. 使用者流程

1. 使用者在旅程內開啟「AI 匯入行程」。
2. 貼上外部 AI agent 的輸出。
3. 系統取得最小必要的旅程 context：旅程起訖日期、既有行程日與使用者權限。
4. 模型只產生符合 schema 的匯入草稿，不直接執行資料寫入。
5. 程式端解析相對日期、檢查日期範圍、標記既有行程與可能重複項目。
6. 預覽依日期分組，使用者可編輯、取消單項或取消整天。
7. 若日期、時間或合併方式有歧義，系統要求使用者選擇，不自行猜測高風險欄位。
8. 使用者按下確認後，伺服器重新驗證 session、admin 權限及每筆 payload。
9. 系統呼叫既有 `createItineraryDay` 或 `updateItineraryDay`，回報逐日成功或失敗結果。

自然語言記帳沿用相同模式：輸入文字、產生語意草稿、解析成員與匯率、以可編輯卡片預覽，確認後才呼叫既有 `createExpense`。

## 5. 建議資料契約

模型輸出只使用語意資料，不接收或產生 MongoDB ID：

```ts
type ItineraryImportDraft = {
  sourceSummary: string;
  days: Array<{
    date?: string; // YYYY-MM-DD；無法確定時省略
    relativeDay?: number; // Day 1 = 1
    title?: string;
    content?: string;
    activities: Array<{
      time?: string; // HH:mm
      endTime?: string;
      title: string;
      type:
        | 'sightseeing'
        | 'food'
        | 'flight'
        | 'ground_transport'
        | 'accommodation'
        | 'shopping'
        | 'activity'
        | 'other';
      locationName?: string;
      note?: string;
      confirmationCode?: string;
    }>;
  }>;
  warnings: Array<{
    code: string;
    message: string;
    dayIndex?: number;
    activityIndex?: number;
  }>;
};
```

正式實作時應以 Zod 定義此契約。模型輸出通過匯入 schema 後，仍須轉換成既有 `createItineraryDaySchema`／`updateItineraryDaySchema` 並再次驗證；不可把模型輸出直接傳給 Mongoose。

支出草稿同樣不得包含模型自行生成的 MongoDB ID 或最終分攤金額：

```ts
type ExpenseImportDraft = {
  expenses: Array<{
    description: string;
    date?: string;
    originalAmount: number;
    currency?: string;
    payerName?: string;
    category?:
      | 'accommodation'
      | 'transportation'
      | 'food'
      | 'shopping'
      | 'entertainment'
      | 'tickets'
      | 'other';
    tags?: string[];
    itineraryDate?: string;
    split:
      | { method: 'equal'; participantNames: string[] }
      | {
          method: 'amount';
          shares: Array<{ memberName: string; amount: number }>;
        }
      | {
          method: 'percentage';
          shares: Array<{ memberName: string; percentage: number }>;
        }
      | {
          method: 'ratio';
          shares: Array<{ memberName: string; units: number }>;
        };
  }>;
  warnings: Array<{ code: string; message: string; expenseIndex?: number }>;
};
```

姓名缺漏、同名、代名詞指向不明、幣別缺漏或分攤總額不一致時必須停在預覽階段。只有在產品規則有明確預設且預覽清楚標示時，才能補入目前使用者、旅程預設幣別或全部成員。

## 6. 技術方案

### 6.1 建議元件

```text
使用者貼上的外部規劃
        ↓
Next.js AI 匯入 endpoint（驗證 session、限流、限制長度）
        ↓
Vercel AI SDK
        ↓
Vercel AI Gateway → OpenAI 模型
        ↓
Zod 結構化草稿
        ↓
程式端正規化、日期對應、衝突檢查
        ↓
可編輯預覽與使用者確認
        ↓
既有 itinerary Server Actions → MongoDB
```

Vercel AI SDK 是應用層，不與 Gateway 綁死。模型建立集中在單一 `provider` 模組，避免 UI、prompt 或匯入邏輯依賴特定供應商：

```text
AI_PROVIDER=vercel  → AI_GATEWAY_API_KEY + openai/<model>
AI_PROVIDER=openai  → OPENAI_API_KEY + <model>
```

從 Gateway 改為 OpenAI 直連時，只更換 provider、認證與 model identifier；匯入 schema、預覽 UI、權限及寫入流程保持不變。API key 只能存在伺服器環境，不得傳至瀏覽器。

### 6.2 建議檔案邊界

```text
src/app/api/ai/itinerary-import/route.ts
src/app/api/ai/expense-draft/route.ts
src/components/ai-import/ItineraryImportDialog.tsx
src/components/ai-import/ImportPreview.tsx
src/components/ai-import/ExpenseDraftCard.tsx
src/lib/ai/provider.ts
src/lib/ai/itineraryImportSchema.ts
src/lib/ai/expenseImportSchema.ts
src/lib/ai/normalizeItineraryImport.ts
src/lib/ai/normalizeExpenseImport.ts
src/lib/ai/importLimits.ts
```

匯入 endpoint 只負責產生草稿；確認寫入應沿用既有 Server Actions，不另建一套繞過權限與通知的資料存取路徑。

## 7. 日期、地點與合併規則

### 日期

- 完整日期優先於 Day N。
- Day N 以旅程開始日換算；旅程沒有開始日期時必須請使用者指定。
- 月日缺少年份時，只能在旅程範圍能唯一對應時自動補齊。
- 超出旅程範圍的日期標記警告，預設不勾選匯入。
- 「明天、下週一」等相對日期以請求時間與旅程時區解讀；旅程尚無時區欄位，MVP 應避免自動接受無法唯一判定的相對日期。

### 地點

- 第一階段保留 `locationName`，不可由模型虛構經緯度。
- 若要寫入現有 location 結構，必須由可信任的地理編碼來源取得座標，或由使用者在預覽中選擇。
- 地理編碼失敗不應阻止活動匯入，活動可先不帶結構化 location。

### 合併

- 已有目標日期：預設附加新活動，不覆蓋標題、內容或既有活動。
- 類似日期、時間與標題只標記「可能重複」，由使用者決定。
- 同批匯入的活動依時間排序；無時間活動排在有時間活動之後。
- 部分日期失敗時回傳逐日結果，不應把已成功寫入的日期偽裝成整批失敗。

## 8. 安全、隱私與成本控制

- AI endpoint 必須登入且具備目標旅程的 admin 權限。
- 限制單次輸入字數、行程天數、每日活動數、總活動數與模型輸出 tokens。
- 不把會員 email、邀請碼、附件 URL、支出紀錄或其他無關資料送給模型。
- confirmation code 屬敏感資料；只在輸入確實包含時解析，不寫入 log 或分析事件。
- prompt injection 一律視為不可信輸入；模型沒有資料寫入 tool，只能回傳 schema 草稿。
- 設定每位使用者與每個旅程的速率限制，並記錄 request、token、latency、結果狀態與 provider，但避免保存完整原文。
- 設定 Gateway/API 預算上限與逾額處理；模型失敗時保留使用者原文，允許重試或回到手動輸入。
- 支出草稿的金額、匯率與分攤合計全部由程式重算；不得信任模型提供的計算結果。

## 9. 實作階段

### Phase 0：樣本與驗證基線

- 收集至少 30 份匿名化的繁體中文外部 AI 行程樣本，涵蓋 Markdown 表格、條列、段落、Day N 與完整日期。
- 收集至少 30 份匿名化的自然語言支出樣本，涵蓋不同幣別、日期說法、付款人、排除成員及四種分攤方式。
- 定義每份樣本的預期結構化輸出。
- 決定 MVP 的單次天數與活動數上限。

完成條件：樣本不含真實個資，且可自動比較日期、時間、標題、類型及警告。

### Phase 1：只解析、不寫入

- 建立 provider abstraction、結構化輸出 schema 與 AI endpoint。
- 加入日期正規化、旅程範圍檢查與錯誤分類。
- 以固定樣本評估模型成功率、成本與延遲。

完成條件：有效輸出全部通過 Zod；錯誤或截斷輸出不會進入寫入流程；核心欄位正確率達到驗收門檻。

### Phase 2：預覽與確認匯入

- 建立依日期分組的可編輯預覽。
- 支援取消單項、警告、重複提示與既有日期附加。
- 確認後重用既有 itinerary Server Actions 寫入。
- 補齊權限、限流、i18n、行動版與整合測試。

完成條件：沒有確認就不會寫入；部分失敗可辨識並重試；公開分享頁不會洩漏敏感欄位。

### Phase 3：自然語言記帳與分攤

- 建立支出草稿 schema、成員名稱解析與可編輯確認卡。
- 支援平均、指定金額、百分比及份數比例分攤。
- 程式端處理匯率、四捨五入與尾差，確認後重用既有 `createExpense`。
- 先驗證單筆輸入，再依實際成功率開放一次多筆支出。

完成條件：付款人與分攤成員有歧義時不會寫入；所有分攤通過既有合計驗證；AI 不能繞過旅程成員、日期、幣別與正數金額限制。

### Phase 4：觀測後擴充

- 評估批次撤銷、重複偵測、缺漏檢查及 checklist 草稿，依使用率與修正率排序。
- 評估既有行程修正、合併與刪除；刪除必須另立確認及復原規格。
- 視使用情況考慮檔案、連結與語音輸入。

## 10. MVP 驗收指標

- 至少 90% 的測試樣本能產生合法 schema。
- 日期、時間、活動標題與類型的欄位正確率至少 90%。
- 不確定的日期或合併決策會顯示警告，不會靜默猜測。
- 使用者確認前可完整查看並修改所有將寫入的資料。
- 任何越權、格式錯誤或超出上限的請求都不會寫入資料庫。
- 相較逐項手動建立，同一份五天行程的完成時間至少降低 50%。
- 追蹤每次匯入的模型成本、延遲、草稿修改率、確認率與失敗原因。
- 自然語言支出的付款人、幣別、日期與分攤對象正確率至少 95%；所有金額計算由確定性程式完成。
- 同名成員、分攤總額不符或幣別無法判定時，確認按鈕保持停用並指出待修正欄位。

## 11. 待決策事項

- MVP 是否只接受貼上文字，或同時接受 Markdown 檔案。
- 單次最多匯入幾天、每天幾項活動。
- confirmation code 預設保留、遮罩，或要求逐項選擇後才匯入。
- 地點是否在 MVP 串接 geocoding，或第一版只匯入名稱與備註。
- 同一天部分活動已存在時，重複提示採字串相似度規則或模型判斷。
- 自然語言記帳缺少參與者時，預設全體成員、只算付款人，或一律要求選擇。
- 百分比與份數分攤的尾差由誰承擔，以及 UI 如何揭露四捨五入結果。
- 批次撤銷是否需要新增 import batch 欄位，或以獨立稽核紀錄保存新增項目 ID。
- Gateway 使用的初始模型與每次匯入的成本上限，應以 Phase 0 樣本實測後決定，不在文件寫死。
