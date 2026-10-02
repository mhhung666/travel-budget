# AI 維護與測試

本頁整理目前程式的 AI 能力、設定與測試入口；日期報告保存在 archive。模型實際使用值以執行環境的 `AI_MODEL` 為準，本機評測成功不代表部署環境已更新。

## 現況

| 功能 | 輸入與權限 | 結果 |
| --- | --- | --- |
| 文字記帳 | 旅程成員輸入單筆自然語言支出 | 金額、幣別、付款人與四種分帳方式的可編輯草稿 |
| 收據辨識 | 旅程成員自己的 JPEG、PNG、WebP 收據 | 商家、日期、幣別、金額候選與欄位可信狀態 |
| 行程匯入 | 旅程 admin 貼上純文字或 Markdown | 逐日活動預覽，確認後匯入 |

三種功能共用 provider、模型與每日使用量／成本限制。AI 解析只產生草稿；使用者確認後才走既有寫入流程。使用流程見 [現有功能](FEATURES.md)。

文字與收據已整合 OpenAI 的必填 nullable schema；文字分帳使用 `anyOf`，輸出轉回原有草稿合約。行程原本已有專用 OpenAI schema。這些設定會依 OpenAI 直連或 Gateway 的 `openai/` 模型自動選用，不需啟用評測用 schema adapter。

程式已補齊文字草稿的日期與幣別驗證、切換幣別時同步匯率、收據支援完整幣別集合，以及行程排序後的警告索引重映射。

## 模型與設定

環境變數總表見 [專案 README](../README.md#3-設定環境變數)。三種功能統一使用 `AI_MODEL`，不使用各功能獨立模型覆寫。

| 設定 | 用法 |
| --- | --- |
| `AI_PROVIDER=vercel` | 使用 `AI_GATEWAY_API_KEY`，未提供時可使用 `VERCEL_OIDC_TOKEN` |
| `AI_PROVIDER=openai` | 使用 `OPENAI_API_KEY` |
| `AI_MODEL` | 三種功能共用；必須支援收據圖片輸入 |
| `AI_TIMEOUT_MS` | 三種功能的解析 timeout，未設時預設 30 秒 |
| `AI_IMPORT_TIMEOUT_MS` | 僅文字／收據在未設 `AI_TIMEOUT_MS` 時的舊設定 fallback；行程不讀取此值 |

本次採用並驗證的 Gateway 模型設定為 `AI_MODEL=openai/gpt-5-mini`。不要把憑證寫入文件或評測證據；設定值仍由各執行環境提供。

## 程式入口

| 維護項目 | 位置 |
| --- | --- |
| 三種 provider、schema 與正規化 | [src/lib/ai](../src/lib/ai/) |
| 身分、配額與草稿 API | [src/app/api/ai](../src/app/api/ai/) |
| 草稿套用與匯率 | [useExpenseForm.ts](../src/components/trips/detail/expense-form/useExpenseForm.ts) |
| 合成案例 | [AI fixtures](../src/__fixtures__/ai/) |
| 代表案例、控制實驗與離線重算 | [aiAccuracyDiagnostic.test.ts](../src/__tests__/aiAccuracyDiagnostic.test.ts) |
| 資料流程回歸 | [aiAccuracyKnownGaps.test.tsx](../src/__tests__/aiAccuracyKnownGaps.test.tsx)（原缺陷已修正，現為一般回歸測試） |
| OpenAI 格式合約 | [openAIExpenseSchemas.test.ts](../src/__tests__/openAIExpenseSchemas.test.ts) |

## 測試方式

以下指令從專案根目錄執行。離線回歸不呼叫模型：

```sh
pnpm exec vitest run src/__tests__/openAIExpenseSchemas.test.ts src/__tests__/aiDraftProviders.test.ts src/__tests__/aiAccuracyKnownGaps.test.tsx src/__tests__/normalizeExpenseTextDraft.test.ts src/__tests__/normalizeItineraryImport.test.ts --maxWorkers=1
```

三種功能各一筆真實 API 驗證（使用 API 額度）：

```sh
AI_DIAGNOSTIC_OUTPUT=/tmp/ai-production-smoke.jsonl \
AI_DIAGNOSTIC_IDS=zh-tw-equal-default,zh-tw-night-market,markdown-table-dates \
AI_DIAGNOSTIC_INTERVAL_MS=60000 pnpm test:ai-accuracy
```

工具讀取 `.env.local`、`.env`，shell 環境變數優先；預設單序列、每筆間隔 60 秒、零 SDK 重試。遇到 `RATE_LIMITED` 或 `FEATURE_DISABLED` 會保存結果並停止。每次使用不同輸出路徑，避免覆寫前次結果；同時保存 JSONL 與 summary。

| 參數 | 用途 |
| --- | --- |
| `AI_DIAGNOSTIC_IDS` | 逗號分隔的案例 ID；未設定時會跑所有選取功能的案例 |
| `AI_DIAGNOSTIC_FEATURES` | `text,receipt,itinerary` 的子集；預設全部 |
| `AI_DIAGNOSTIC_REPEATS` | 每例重跑 1–5 次 |
| `AI_DIAGNOSTIC_INTERVAL_MS` | 每筆間隔，預設 60000 |
| `AI_DIAGNOSTIC_OUTPUT` | 必填輸出路徑 |

全部共有 106 筆合成案例。測正式行為時不要設定 `AI_DIAGNOSTIC_THINKING`、`AI_DIAGNOSTIC_SYSTEM_APPEND`、`AI_DIAGNOSTIC_RELAX_TIME_PATTERN` 或 `AI_DIAGNOSTIC_OPENAI_SCHEMA`；這些僅供控制實驗。不同模型、提示或 schema 變體應分開保存與解讀。

不呼叫 API，離線重算已保存的基準：

```sh
AI_DIAGNOSTIC_REPLAY_INPUT=docs/archive/tests/evidence/ai-2026-09-17/smoke.jsonl,docs/archive/tests/evidence/ai-2026-09-17/paced-baseline.jsonl,docs/archive/tests/evidence/ai-2026-09-17/representative-baseline.jsonl \
AI_DIAGNOSTIC_OUTPUT=/tmp/ai-replay.json \
pnpm exec vitest run src/__tests__/aiAccuracyDiagnostic.test.ts --maxWorkers=1
```

離線重算會對案例去重；只合併相同模型與條件的資料。工具不會完整檢查所有實驗參數是否一致，不能混合調參結果當成基準。

## 已驗證範圍與限制

- GPT-5 mini 正式程式已完成三功能各一筆 API 驗證；修正時的 222 項離線回歸通過。這是當次證據，不是整體準確率或完整正式環境驗收。
- 建議小費與已付款總額仍可能混淆；改善歧義提示、確認流程與推理速度尚待後續處理。
- 尚未完成全部 106 筆的穩定 live 基線、真實拍照收據與真人操作驗收。日期、分類與警告的 fixture 精確比對也可能與合理語意不同，須查看逐筆輸出。
- HTTP 400 schema 錯誤、429 限流與內容辨識錯誤應分開統計。呼叫成功不等於內容完全正確。

## 歷史評測

- [修正前代表案例與 Qwen／GPT-5 mini 對照](archive/tests/AI_ACCURACY_2026-09-17.md)
- [OpenAI 相容性與五項缺陷修正驗證](archive/tests/AI_FIXES_2026-09-18.md)
- [逐筆證據與統計索引](archive/tests/evidence/AI.md)
- [早期智慧輸入規劃](archive/plans/AI_IMPORT_PLAN.md)、[行程匯入 Phase 0–2 摘要](archive/history/AI_ITINERARY_IMPORT_PHASES_0_2.md)
