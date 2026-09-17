# AI 評測原始證據

本目錄保存合成案例的模型回應與評分，不包含正式使用者輸入。現行測試方式見 [AI 維護與測試](../../../AI.md)。同名 `.jsonl` 為逐筆資料，`.summary.json` 為該次彙總；成功率與內容準確度須分開解讀。

## 2026-09-17～18：修正前模型與設定對照

資料位於 [ai-2026-09-17/](ai-2026-09-17/)，包含隔日完成的 GPT-5 mini 實驗。結論與限制見 [評估報告](../AI_ACCURACY_2026-09-17.md)。

| 檔名前綴 | 內容 |
| --- | --- |
| `smoke`、`paced-baseline`、`representative-baseline` | Qwen 原設定的分次基準；有重複案例與 provider 失敗 |
| `combined-baseline.summary.json` | 僅將上述三份基準合併去重後重算 |
| `thinking` | 相同代表案例啟用 Qwen thinking |
| `explicit-prompt` | 加強欄位抽取提示 |
| `ambiguity-prompt` | 加強幣別／總額歧義提示 |
| `time-pattern` | 僅於測試移除送給模型的時間 regex |
| `schema-failure.jsonl` | 跨年行程無效輸出的診斷；沒有獨立 summary |
| `gpt5mini-original` | 修正前正式程式使用 GPT-5 mini，含兩筆 HTTP 400 |
| `gpt5mini-adapted` | 測試用 OpenAI schema 適配，尚未正式整合時的對照 |
| `gpt5mini-prompt` | 適配後再追加歧義提示，單筆收據對照 |

## 2026-09-18：正式修正驗證

[production-fixes.jsonl](ai-2026-09-18/production-fixes.jsonl) 與 [summary](ai-2026-09-18/production-fixes.summary.json) 保存三種功能各一筆正式程式呼叫，未開啟實驗適配或追加提示。修改範圍與離線測試見 [修正紀錄](../AI_FIXES_2026-09-18.md)。

## 保存原則

- 原始證據保留當次輸出與評分口徑，不為了符合現況而改寫；需要新結論時新增日期資料與報告。
- 合併前確認模型、提示、schema、案例與評分規則一致；多次重跑不算新的獨立案例。
- 新測試結果先寫入 `/tmp`，整理完成且報告引用後才收入 archive；JSONL 與 summary 一起保存。
