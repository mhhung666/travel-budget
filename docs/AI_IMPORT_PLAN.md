# AI 行程匯入與智慧輸入規劃

> 狀態：`ready`
> 更新日期：2026-08-04
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
src/lib/ai/evaluateItineraryImport.ts
src/__fixtures__/ai/itineraryImportFixtures.ts
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

## 9. MVP 已決策範圍

以下決策適用於 Phase 0–2；若實測顯示限制不合理，再以文件變更明確調整，不在實作中自行擴張範圍。

| 項目 | MVP 決策 |
| --- | --- |
| 輸入 | 只接受貼上的純文字或 Markdown 文字，不接受檔案、圖片、網址或語音 |
| 單次上限 | 最多 30,000 字、14 天、每日 15 個活動、合計 120 個活動 |
| 寫入方式 | 只新增活動；目標日期已存在時附加，不覆蓋既有標題、內容或活動 |
| 地點 | 只保存文字名稱，不做 geocoding，不接受模型產生的經緯度 |
| 確認碼 | 可以解析，但預覽預設遮罩；log、分析事件與錯誤訊息不得包含原值 |
| 重複判斷 | 使用日期、標準化時間與標題的確定性規則提示，由使用者決定是否匯入 |
| 相對日期 | 支援 `Day N`；「明天」、「下週一」等無法唯一判定的說法必須警告並要求修正 |
| 權限 | 只有旅程 admin 可解析與確認匯入；分享頁及公開 API 不提供此能力 |
| AI 失敗 | 保留瀏覽器內的原始輸入供重試，不把完整原文長期存入資料庫或 log |
| 功能邊界 | Phase 0–2 只交付行程匯入；自然語言記帳另列 Phase 3，不阻塞行程 MVP |

## 10. 執行 Phase

Phase 必須依序通過完成條件。Phase 0 與 Phase 1 可以在同一開發分支進行，但在解析基線通過前，不開始資料寫入功能。

| Phase | 狀態 | 可交付結果 | 是否寫入旅程資料 |
| --- | --- | --- | --- |
| 0 | `complete` | 固定樣本、期望輸出、限制與評分工具 | 否 |
| 1 | `implemented` | 具權限與限制保護的結構化解析 endpoint；live baseline 待可用額度 | 否 |
| 2A | `complete` | 可編輯、可取消項目的匯入預覽 | 否 |
| 2B | `planned` | 明確確認後的逐日匯入與失敗重試 | 是 |
| 2C | `planned` | i18n、行動版、觀測、整合與安全驗收 | 是 |
| 3 | `deferred` | 自然語言支出草稿與分攤 | 是，須另行確認 |

### Phase 0：樣本、契約與驗證基線

狀態：`complete`（2026-08-04）

目標是先建立可重跑的品質基線，避免以少數手動範例判斷模型是否可用。

交付物：

- 至少 30 份匿名化行程樣本，涵蓋 Markdown 表格、條列、段落、`Day N`、完整日期、跨年日期、缺少時間、重複活動及超出旅程範圍。
- 每份樣本的期望結構化輸出與必要 warning code；測試 fixture 不包含真實姓名、Email、邀請碼或有效確認碼。
- `ItineraryImportDraft` 的 Zod schema、固定 warning/error code，以及不依賴模型的日期正規化與重複提示規則。
- 可重跑的評分工具，至少統計合法 schema 比例，以及日期、時間、標題、類型的欄位正確率。
- import limits 集中定義，伺服器與 UI 共用同一組數值。

測試重點：schema 邊界、空白輸入、超長輸入、超量天數／活動數、錯誤日期、未知活動類型、confirmation code 不出現在測試輸出快照。

完成條件：fixture 可在不呼叫外部模型的情況下執行；正規化與限制測試全數通過；warning/error code 足以讓 UI 對應，不需解析模型的自由文字錯誤。

完成證據：31 份 fixture 均通過草稿 schema；評分工具可分別計算 schema 合法率及日期、時間、標題、類型正確率；Phase 0 的 23 項測試涵蓋輸入與輸出上限、無效日期／時間、未知欄位、日期換算、活動排序、既有活動與同批重複、敏感確認碼及評分結果。核心程式位於 `src/lib/ai/`，樣本位於 `src/__fixtures__/ai/`。

### Phase 1：只解析、不寫入

狀態：`implemented`（2026-08-04）；`openai/gpt-5.6-luna` 與 `google/gemini-3.1-flash-lite` 在 Gateway Free tier 均回覆 HTTP 403，後者的 3 次 smoke request 皆未產生 token。`alibaba/qwen3.7-flash` 可生成，但需在 prompt 明列 JSON 欄位骨架並關閉 thinking；節流 11 秒的 31 筆評估仍只有 6 筆到達模型（3 筆合法、3 筆無效），其餘 25 筆被 Gateway Free tier rate limit 拒絕，初步 schema 遵循率為 50%。

OpenAI nano 初測使用 required-nullable provider schema，再轉回既有 optional 草稿契約。`openai/gpt-4.1-nano` 單筆 smoke 為合法 schema、核心欄位 100%、約 3.3 秒、721 input／128 output tokens；5 筆小樣本有 4 筆到達模型且 4 筆皆為合法 schema，這 4 筆共 33 個核心欄位、答對 29 個，正確率約 87.9%，第 5 筆遭 Free tier 429。`openai/gpt-5-nano` 預設推理的單筆雖達 100%，但約需 21.7 秒與 2,964 output tokens；改成 minimal reasoning 後約 3.5 秒與 189 output tokens，該次核心欄位為 85.7%，後續 5 筆皆遭 Free tier 429。`openai/gpt-5-mini` 第一筆即遭 Free tier 429，尚無品質資料。依目前小樣本，開發環境暫選 `openai/gpt-4.1-nano`；它尚未達 90% 品質門檻，完整 baseline 仍需等待限流重置或使用付費額度。

目標是讓 admin 能把文字轉成合法草稿，同時證明此路徑沒有任何資料寫入能力。

交付物：

- 集中的 AI provider abstraction；模型與 provider 由伺服器環境設定，未設定時回傳可辨識的功能停用錯誤。
- `POST /api/ai/itinerary-import`：依序驗證 session、旅程 admin、輸入長度與使用量，再呼叫模型產生結構化輸出。
- 系統 prompt 只提供旅程起訖日期及解析必要資訊，不提供成員 Email、邀請碼、附件、支出或其他旅程資料。
- 模型輸出經 Zod、日期正規化、範圍檢查與數量限制後才回傳；無效、截斷或超量輸出整批拒絕。
- 結構化錯誤狀態：未登入、非 admin、功能未設定、輸入無效、超過限制、使用量受限、模型逾時、模型輸出無效。
- 記錄 provider、model、latency、token usage、結果狀態與錯誤分類；不記錄完整輸入、完整模型輸出或確認碼。

測試重點：未登入與非 admin 不會呼叫 provider；惡意 prompt 仍只能得到 schema 草稿；provider timeout、截斷、非 schema 輸出及超量輸出可安全失敗；route 測試不得觀察到 itinerary action 或 Mongoose 寫入。

完成條件：有效回應 100% 通過 Zod；至少 90% 固定樣本可產生合法 schema，核心欄位正確率達 90%；失敗請求不寫入資料且能安全重試；成本與延遲已有可比較的基線紀錄。

實作證據：集中 provider、最小化 prompt、唯讀 context loader 與 route 分別位於 `src/lib/ai/` 及 `src/app/api/ai/itinerary-import/route.ts`；route/provider 自動化測試涵蓋未登入、非 admin、無效／超長輸入、功能停用、rate limit、timeout、截斷、無效模型輸出、去敏 log，以及零 itinerary action 呼叫。`pnpm test:ai-import-eval` 僅在明確啟用 live eval 時載入 `.env.local`、使用 Node 測試環境，並彙總安全的 provider 錯誤分類；可用 `AI_IMPORT_EVAL_CASE_LIMIT` 限制 smoke 樣本、用 `AI_IMPORT_EVAL_INTERVAL_MS` 對 Free tier 評估節流，而且 live eval 關閉 SDK retry，避免限流請求被重送。Alibaba 模型會明確停用 thinking，以避免簡單抽取浪費 reasoning tokens。通過全部固定樣本的 90% 門檻並記錄 latency/token baseline 後才將本 Phase 改為 `complete`。

### Phase 2A：可編輯預覽

狀態：`complete`（2026-08-04）

目標是讓使用者在任何寫入發生前，完整看見並修正結果。

交付物：

- 在旅程行程頁提供 admin 專用「AI 匯入」入口；非 admin 不顯示入口，伺服器仍獨立驗權。
- 輸入畫面顯示字數與 MVP 上限，解析失敗後保留文字，使用者可修改並重試。
- 預覽依日期分組，活動欄位可編輯，可取消單項或整天，並顯示新增、附加、可能重複、超出範圍與待修正狀態。
- confirmation code 預設遮罩，只有明確操作才顯示；無日期、日期有歧義或欄位不合法時停用確認按鈕並定位問題。
- 預覽使用既有行程活動的欄位與驗證規則，避免匯入 UI 形成第二套資料契約。

測試重點：鍵盤操作、焦點管理、手機寬度、深色模式、取消項目、修正錯誤後恢復確認、確認碼遮罩，以及重新解析不會意外保留前一份草稿。

完成條件：使用者可在單一預覽流程檢查並修改所有待寫欄位；未解決的阻擋錯誤存在時不能確認；到此 Phase 為止仍無資料寫入。

完成證據：admin 的行程頁入口與輸入／預覽流程位於 `src/components/ai-import/`；輸入畫面共用伺服器字數上限，API 失敗時保留原文，重新解析會先清除舊草稿。預覽可逐日與逐項取消，提供日期、標題、內容、時間、類型、地點文字、備註及訂位代碼編輯，並標示新增、附加、可能重複與超出範圍狀態；超出範圍的日期預設不勾選，訂位代碼預設遮罩。純函式會依現有行程欄位限制重驗草稿、排除未選項目並重新編排 warning index；任何阻擋問題存在時完成檢查按鈕維持停用。Phase 2A 的 7 項測試涵蓋日期範圍、時間修正、新增日標題、取消與 warning 重排、失敗保留原文、確認碼遮罩、修正後恢復確認及重新解析隔離；此流程沒有呼叫 itinerary mutation 或其他資料寫入。

### Phase 2B：確認匯入與逐日結果

目標是只在使用者明確確認後，重用現有行程權限與驗證路徑寫入資料。

交付物：

- 確認送出時再次驗證 session、admin 權限、旅程範圍、數量上限及每筆活動 payload，不信任預覽期間保留的權限或模型輸出。
- 依日期呼叫既有 `createItineraryDay`／`updateItineraryDay`；已存在日期只附加已勾選活動，不覆蓋既有資料。
- 每日回報成功或失敗。部分成功時保留失敗日供修正與重試，已成功日不得被同一次重試重複建立。
- 成功後更新相關 query、活動紀錄與畫面；結果摘要清楚列出新增天數、活動數、跳過數及失敗數。
- 對使用者重複點擊與網路重送提供冪等保護；具體機制在實作前以小型設計註記定案。

測試重點：確認前零寫入、確認時權限已被撤銷、既有日期附加、部分失敗、重試、重複送出、活動數競態超限，以及模型草稿不能繞過現有 Zod schema。

完成條件：沒有明確確認就不會寫入；成功與失敗可逐日辨識；重試不重複建立已成功項目；公開 DTO 與分享頁不增加任何敏感欄位。

### Phase 2C：MVP 完整驗收與發布準備

目標是補齊可正式開放所需的跨功能品質，而不是在 2B 寫入成功後立即視為完成。

交付物：

- 四語 i18n、響應式與無障礙檢查；載入、空白、錯誤、部分成功及功能未設定皆有對應畫面。
- 以使用者及旅程為單位的持久化使用量限制與成本上限；Serverless 環境不得使用記憶體計數冒充全域限流。
- 產品事件只記錄解析、預覽、確認、取消、修正率與錯誤分類等去識別資料。
- production build、route/action 整合測試及既有行程流程回歸測試。
- 更新環境變數範例、部署說明、`FEATURES.md`、`ARCHITECTURE.md`、`ROADMAP.md` 與必要的 `CHANGELOG.md`。

完成條件：第 11 節所有行程 MVP 指標通過；未設定 AI 環境時其餘應用功能正常；可觀察成本、延遲、確認率與失敗原因；完成一次五天行程的真人或腳本化端到端驗收。

### Phase 3：自然語言記帳與分攤（MVP 後）

Phase 3 不屬於第一個行程匯入版本。開始前須依 Phase 0 的方式另建支出樣本與驗收基線，並重新確認缺少參與者時的預設、同名成員處理及分攤尾差規則。

- 建立支出草稿 schema、成員名稱解析與可編輯確認卡。
- 先支援單筆，再依成功率決定是否開放一次多筆支出。
- 程式端處理匯率、四捨五入與尾差，確認後重用既有 `createExpense`。
- 平均、指定金額、百分比及份數比例都必須通過現有確定性分攤驗證。

完成條件：付款人或分攤成員有歧義時不會寫入；分攤總額不符時不能確認；AI 不能繞過旅程成員、日期、幣別與正數金額限制。

### Phase 4：觀測後擴充

- 評估批次撤銷、進階重複偵測、缺漏檢查及 checklist 草稿，依實際使用率與修正率排序。
- 評估既有行程修正、合併與刪除；刪除必須另立確認及復原規格。
- 視使用情況考慮檔案、連結、圖片與語音輸入。

## 11. MVP 驗收指標

- 至少 90% 的測試樣本能產生合法 schema。
- 日期、時間、活動標題與類型的欄位正確率至少 90%。
- 不確定的日期或合併決策會顯示警告，不會靜默猜測。
- 使用者確認前可完整查看並修改所有將寫入的資料。
- 任何越權、格式錯誤或超出上限的請求都不會寫入資料庫。
- 相較逐項手動建立，同一份五天行程的完成時間至少降低 50%。
- 追蹤每次匯入的模型成本、延遲、草稿修改率、確認率與失敗原因。
- 解析 endpoint 的未登入、越權、格式錯誤、超限、逾時與 provider 無效輸出都有自動化測試。
- 同一確認請求重送時不會重複建立已成功的活動。
- 未設定 AI provider 或使用額度用盡時，其餘手動行程功能不受影響。

Phase 3 開始後另加支出指標：付款人、幣別、日期與分攤對象正確率至少 95%；所有金額計算由確定性程式完成；同名成員、分攤總額不符或幣別無法判定時不能確認。

## 12. 尚待實作前定案

- Phase 2B 的冪等 key 與成功項目紀錄保存方式；需能處理部分成功後重試，但 MVP 不必同時提供批次撤銷。
- 持久化使用量限制的儲存方案與初始門檻；需適用 Serverless 並可設定每位使用者、每個旅程及整體成本上限。
- Gateway 使用的初始模型與每次匯入的成本上限，應以 Phase 0 樣本實測後決定，不在文件寫死。
- Phase 3 的參與者預設、同名成員消歧義及百分比／份數尾差規則；不影響 Phase 0–2 開工。
