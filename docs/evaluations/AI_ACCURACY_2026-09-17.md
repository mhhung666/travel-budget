# AI 功能準確度評估 — 2026-09-17

> 本文保留修正前的評測結果。9/18 已整合 OpenAI 格式相容性並修正五項程式缺陷；目前狀態與驗證見 [修正紀錄](AI_FIXES_2026-09-18.md)。歷史 schema adapter 實驗已不再是正式使用的必要條件。

目前證據顯示，問題同時存在於程式資料處理、提示規則，以及模型的指令遵從性。應先修正可確定的資料流程錯誤，並增加重要欄位的程式驗證，再用同一套案例比較替代模型。直接開啟 thinking 並未改善這次選出的錯誤。

9/18 補充對照：GPT-5 mini 改善了缺年份文字、行程時間與跨年結構，但原程式的文字／收據 schema 不相容，不能只換 `.env` 就視為切換完成。加強收據提示詞可讓它提示總額歧義，但仍未完整保留兩個總額候選。建議將 GPT-5 mini 列為下一階段候選，先完成格式適配與下列五項資料流程修正，再增加真實案例評測。

依使用者選擇，本次完成三種功能的代表案例與設定對照，**沒有跑完全部 106 筆，也不能把本次比例當成正式環境準確率**。基準模型為 `alibaba/qwen3.7-flash`，9/18 另以使用者更新的 `openai/gpt-5-mini` 設定對照。所有案例均為合成資料。

## 代表案例的結果

基準涵蓋 14 個不同案例：文字 7、收據 4、行程 3。13 個取得有效結構化輸出；跨年行程未通過 schema，另重跑一次也重現。重複呼叫不算成新的獨立案例。

| 功能 | 觀察到的結果 | 實際影響 |
| --- | --- | --- |
| 文字記帳，7 例 | 金額、付款人、參與者與分帳方式／數值符合預期 7/7；日期 6/7、幣別 6/7；分類 7 例都省略 | 數字和分帳基本抽取可用，但重要的不確定資訊會被當成確定值。分類是漏填，不是 schema 格式錯誤。 |
| 收據，4 張 | 店名、日期 4/4 符合；幣別狀態／值 3/4、總額狀態／值 3/4 符合保守預期 | 基本辨識能讀到內容，但不可靠地區分建議金額與實付金額。這些是合成圖片，不能外推真實拍照 OCR 表現。 |
| 行程，3 例 | 2 例有效輸出中的 4 個明確時間都沒有填入活動 time；跨年案例輸出無效 | 模型看得到時間，卻把它放在摘要／備註；使用者的行程時間仍會空白。 |

具體重現：

- 文字「9/4 早餐 360 TWD，我先付，大家平分」沒有年份，模型輸出 `2024-09-04`，違反原 prompt 的缺年份不填日期規則。
- 文字「Lunch was $60 …」被直接判成 USD，沒有幣別不明警告。
- 收據只有 `$`，模型輸出 USD，卻同時標 `fieldStatus.currency: missing`。現有 UI 會要求確認且不直接套用此幣別，因此不能說這筆一定會錯存 USD。
- 收據列出 `PRE-TIP TOTAL 54`、`TIP SUGGESTED 10`、`TOTAL WITH TIP 64`，模型直接認定實付 64。已人工檢視圖片；依本產品保守規則，建議小費不代表確實支付，應讓使用者確認。
- 行程表明載 09:00、12:30；模型摘要包含這兩個時間，活動物件卻沒有 time。
- 跨年案例把選填 locationName、confirmationCode 填成空字串而違反 min-length，且重複產生晚餐活動。無效原始 JSON 與驗證路徑已保存於 `schema-failure.jsonl`；不能只放寬 schema 就當作正確。

## 同模型的控制實驗

固定模型、原始案例、temperature 0、30 秒 timeout。評測本身關閉 SDK 重試。以下主要對照各只有單次輸出，僅能說明這些案例，不能宣稱普遍改善率。

| 設定 | 缺年份文字 | 建議小費收據 | 行程時間欄位 | 三筆平均耗時 |
| --- | --- | --- | --- | --- |
| 原設定、thinking 關閉 | 補成 2024 年、無分類 | 直接選 64 | 兩個時間都漏填 | 3.76 秒 |
| 只開 thinking | 仍補 2024 年、無分類，另多了參與者不確定警告 | 仍直接選 64 | 仍漏填 | 22.91 秒 |
| 只附加明確的欄位檢查提示詞 | 開始填 food，但仍補 2024 年 | 仍直接選 64 | 仍漏填 | 3.92 秒 |

thinking 的三筆 output tokens 合計 5,888，原設定同三例為 441；這是 provider 回報的總 output tokens，並非畫面可見 JSON 的字數。這次沒有證據支持用 thinking 作為修正方案。

另外只移除發給 provider 的 time/endTime regex，維持原 prompt，結果依然漏填時間。正式程式的 schema 沒有改動，回傳仍經原有驗證；此實驗只能排除「該 regex 是唯一原因」，不能排除所有 schema 設計因素。

更明確的幣別／建議小費規則另作補充對照，逐筆保存在 `ambiguity-prompt.jsonl`。文字 `$60` 即使明確要求不推測、改提示 AMBIGUOUS_CURRENCY，仍輸出 USD；分類則開始輸出 food。收據 `$` 仍輸出 USD 並標 missing，建議小費收據仍直接選 64；三個目標問題皆未改善。

## GPT-5 mini 對照（2026-09-18）

原程式三筆測試中，文字與收據收到 HTTP 400；行程成功。文字錯誤由使用者提供 Gateway 訊息確認：`split` 的 `oneOf` 不被接受。行程本來就有 OpenAI 專用 nullable schema 與 `reasoningEffort: minimal`，另外兩項沒有。

OpenAI Structured Outputs 要求所有欄位列為 required，選填資料以 null 表達；評測工具新增可選的 schema 轉換（oneOf→anyOf、選填→required nullable），回傳刪除 null 後仍通過原始 Zod 驗證。這只是測試用適配，正式程式尚未修正。[官方 schema 規則](https://developers.openai.com/api/docs/guides/structured-outputs)；[GPT-5 mini 支援圖片輸入與 Structured Outputs](https://developers.openai.com/api/docs/models/gpt-5-mini)。

未適配的行程表格輸出正確的 09:00、12:30，但多了錯誤 DATE_OUTSIDE_TRIP 警告，警告文字自己也承認日期在範圍內。原始結果保存於 `gpt5mini-original.jsonl`。

只加入測試 schema 適配、維持原 prompt 後：缺年份的早餐文字不再補年份，分類正確為 food，另給 MISSING_DATE 警告；耗時 11.22 秒。建議小費收據仍將 64 視為確定總額，未提示歧義；耗時 12.98 秒。行程表格重測正確填入兩個時間，這次沒有額外警告；耗時 10.72 秒。因此目前已能區分「呼叫相容性」與「內容判斷」兩層問題，也觀察到同一行程案例的警告不穩定。

相同三個代表案例，Qwen 原設定平均 3.76 秒、output tokens 共 441；GPT-5 mini 在適配後平均 11.64 秒、output tokens 共 1,930。OpenAI 的文字／收據使用模型預設推理設定，行程使用原程式 minimal；沒有為了速度調整推理強度。數字包含 provider 回報的推理消耗，不能當成可見文字長度；沒有使用帳單核對金額。

另外測試跨年行程：GPT-5 mini 能通過原有驗證，保留 2026-12-31 20:00 與 2027-01-01 00:00，活動沒有重複；耗時 6.16 秒。「港邊」保留在標題，未另填 locationName；煙火分類 sightseeing 與 fixture 的 activity 不同，屬合理分類差異。四筆適配後案例均取得有效輸出，**不代表四筆內容完全正確**。結果保存於 `gpt5mini-adapted.jsonl`。

最後以和 Qwen 完全相同的加強歧義提示詞重測建議小費收據：GPT-5 mini 改為 `fieldStatus.total: ambiguous` 並產生 `AMBIGUOUS_TOTAL`，但 54 仍列為 unknown/subtotal，只有 64 列為 total；因此歧義攔截改善、候選保留未完整達標。耗時 13.37 秒，output tokens 1,008，結果保存於 `gpt5mini-prompt.jsonl`。Qwen 在相同追加提示詞下沒有產生此歧義警告。這是單一案例的控制對照，不能推算整體改善率。

本輪 GPT-5 mini 共呼叫 8 次：原程式 3 次、schema 適配 4 次、提示詞對照 1 次；2 次 HTTP 400，6 次取得有效輸出，沒有 429。行程表格重跑不算新案例，總共測了 4 個不同案例。原始 400 的自動記錄只有安全的錯誤類型／狀態碼，文字 oneOf 細節來自使用者提供的 Gateway 訊息；收據的具體拒絕欄位未取得，不能聲稱它也是 oneOf。

## 已以本地測試證實的產品缺陷

這些問題不依賴模型能力，正式程式尚未修改。

| 優先度 | 問題 | 修正方向 |
| --- | --- | --- |
| 高 | 文字草稿把 TWD 表單改成 USD 10，已知 USD 匯率 32，卻仍保留匯率 1 | 文字與收據共用幣別／匯率更新流程。否則台幣換算與分帳金額會錯。 |
| 高 | 收據 normalize 把正確 GBP 刪掉 | 使用主程式共用 ISO 幣別集合；這裡仍限六種幣別，與主程式不一致。 |
| 中 | 文字草稿接受 `2026-02-30` 而不要求修正 | 增加真實日曆日期驗證。注意這不會擋住「合法但亂補」的 2024 日期，還需來源一致性檢查。 |
| 中 | 文字草稿接受 `ZZZ` 幣別而不要求修正 | 使用共用 ISO 幣別驗證，避免到儲存時才拒絕。 |
| 中 | 行程按時間排序後，既有 warning.activityIndex 未同步轉換 | 排序時重映射警告索引，避免標錯活動。 |

重現檔：`src/__tests__/aiAccuracyKnownGaps.test.tsx`。其中 5 個 `it.fails` 表示期望的正確行為目前不成立，**不是缺陷已修正**。修正產品時應移除對應 `.fails`。

## 評分工具的問題與本次改善

- 文字舊評分不看總額、分帳方式或每人分攤數字，錯錢也可能拿滿分。本次加入金額、分帳數值、分類、警告代碼比較。
- 收據舊評分忽略 expected 為 missing 的欄位，亂補店名也可能滿分。本次同時檢查狀態與值，且增加店名／日期 ambiguity 評分。
- 行程舊評分不扣多編活動的分數，缺失活動的空白選填欄位還可能得分。本次增加結構、結束時間、地點、訂位代碼，並修正缺失活動的計分。
- 新診斷工具保存逐筆 expected、raw、actual、延遲、usage、錯誤分類；無效模型 JSON 另保留安全的驗證資訊，不保存憑證或 provider request/header。
- 準確度針對成功輸出計算，provider/schema 失敗另列；沒有成功樣本時為 null。
- 離線 replay 可重算保存的報告，依 feature/id 去除重複成功案例。這次只比較合成案例，不讀取正式旅行／消費資料。

**仍須人工複核評分，不宜只看 aggregate 分數：**

- Day 1 依旅行起日換成正確完整日期，是等價表達；raw exact-match 會扣分。
- 「京都散步」分類成 activity 或 sightseeing，以及從「大阪城」抽取同名地點，都可能合理。不能把 fixture 沒填的選填地點一律當作幻覺。
- `大家` 與空 participantNames 在現有 normalize 都會展開為全員，雖然 raw 字串評分不同。
- warning 代碼採 exact-match；合理的額外警告也可能被判不符。收據 missing 狀態仍會阻止 UI 直接套用欄位，因此 ambiguity 狀態分數不等於實際錯存率。
- 零樣本的 ambiguity 子分數沿用既有 evaluator 的 1，請看分母；不能解讀成該情境已測試且全對。
- `duplicate-participant` fixture 預期保留重複 Alex，但 prompt 要求姓名只留一次，測試答案與規則尚待對齊。

## 尚未涵蓋的產品與資料風險

- 「四個人均分」目前 fixture 使用空參與者名單，normalize 會展開為所有旅行成員；旅行不是四人時，缺少人數／子群資訊。
- 文字 prompt 沒有今天、時區或旅行日期背景；相對日期／缺年份的日期規則需先定義，不能任由模型補年份或表單保留日期而不提示。
- itineraryDate 可被模型抽取，但 applyTextDraft 沒套入 itineraryDayIds。
- 收據 prompt 要求每個合理金額，schema 卻最多 12 筆且只接受正數；長收據、零額與負折扣／退款需補案例。
- 收據 fixtures 直接傳 PNG；正式上傳會壓縮成長邊 1600、0.8 MB WebP。尚未比較壓縮前後，也未取得匿名真實失敗收據。
- 尚未實測 prompt injection、長輸入截斷、大量 locale 轉換或真實瀏覽器→上傳→API→表單完整流程。
- 模型比較僅涵蓋代表案例，且 OpenAI 的 schema 適配與行程 reasoning 設定不同，不能視為只改模型、其他條件完全相同的實驗。

## 限流與驗證

本地 LOCAL_USE 最初出現 `Free tier requests on this model are rate-limited.`。冷卻後同一把目前設定的 key 可正常呼叫三種功能，所以沒有證據顯示新 key 無法啟用。20 秒間隔、零重試仍在第五筆成功後收到 429；沒有 Retry-After，不能推定固定的官方限制數字。

後續代表案例改成單序列、每筆至少間隔 60 秒。工具遇到 RATE_LIMITED / FEATURE_DISABLED 會保存資料並終止，不持續撞 API。Vercel 官方區分花費預算超限（402）與請求限流（429），截圖的 `$0/$5` 不能代表請求限流狀態：[官方說明](https://vercel.com/docs/ai-gateway/rate-limits)。

離線檢查：153 個正常測試通過，5 個產品缺陷以 expected failures 重現；另有離線 report replay 驗證通過。變更檔案 lint、排除 .next generated validators 的 source TypeScript 檢查通過。完整 `tsc --noEmit` 仍受既有 .next 產物引用不存在的 `memberships/page.js` 阻擋。

本次只修改評估工具、測試和報告；正式 prompt、表單與資料處理尚未改動。使用者已自行把本機 .env 模型改成 GPT-5 mini；沒有提交、部署或提升應用程式版本。

## 重跑與原始證據

原始檔在 `docs/evaluations/ai-2026-09-17/`，包含基準、thinking、提示詞、時間 regex、schema 失敗診斷及各 summary。`combined-baseline.summary.json` 只合併基準並去重，不混入調參結果。

評測讀取 `.env.local`、`.env`，shell 環境變數優先。每次用不同報告路徑保存結果。預設 60 秒間隔、零 SDK 重試，與正式 provider 的 retry 1 次不同；主要是避免測試限流污染內容準確度。

```sh
# 三功能各一筆。
AI_DIAGNOSTIC_IDS=zh-tw-equal-explicit,zh-tw-night-market,markdown-table-dates \
AI_DIAGNOSTIC_OUTPUT=/tmp/ai-smoke.jsonl pnpm test:ai-accuracy

# 對相同案例只變更 thinking。
AI_MODEL=alibaba/qwen3.7-flash \
AI_DIAGNOSTIC_IDS=zh-tw-equal-default,ambiguous-two-totals,markdown-table-dates \
AI_DIAGNOSTIC_THINKING=true AI_DIAGNOSTIC_OUTPUT=/tmp/ai-thinking.jsonl pnpm test:ai-accuracy

# GPT-5 mini：僅於評測加入文字／收據 schema 適配，正式程式不變。
AI_MODEL=openai/gpt-5-mini AI_DIAGNOSTIC_OPENAI_SCHEMA=1 \
AI_DIAGNOSTIC_IDS=zh-tw-equal-default,ambiguous-two-totals,markdown-table-dates,cross-year \
AI_DIAGNOSTIC_OUTPUT=/tmp/ai-gpt5mini.jsonl pnpm test:ai-accuracy

# 不呼叫 API，離線重算保存的基準。
AI_DIAGNOSTIC_REPLAY_INPUT=docs/evaluations/ai-2026-09-17/smoke.jsonl,docs/evaluations/ai-2026-09-17/paced-baseline.jsonl,docs/evaluations/ai-2026-09-17/representative-baseline.jsonl \
AI_DIAGNOSTIC_OUTPUT=/tmp/ai-replay.json \
pnpm exec vitest run src/__tests__/aiAccuracyDiagnostic.test.ts --maxWorkers=1
```

移除 IDs 篩選可跑全部 106 筆；重複次數用 AI_DIAGNOSTIC_REPEATS（1–5），模型用 AI_MODEL 覆寫。提示詞追加用 AI_DIAGNOSTIC_SYSTEM_APPEND；time regex 對照僅用於行程，設 AI_DIAGNOSTIC_RELAX_TIME_PATTERN=1。請固定其餘條件，分開保存各種設定；需要更可信的選型結論時，補真實匿名案例、重複試驗與其他模型的對照。
