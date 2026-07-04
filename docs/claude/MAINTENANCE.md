# 制度維護協議

> 讀者：任何 Claude 模型。管的是 CLAUDE.md 與 docs/claude/* 這套制度檔本身怎麼演化。

## 1. 哪些檔可以自行改（不用問）

| 檔案 | 允許的修改 |
|---|---|
| [LESSONS.md](LESSONS.md) | **隨時 append**（見 §3 格式）；不准刪別人的條目 |
| [ARCH-NOTES.md](ARCH-NOTES.md) | 程式碼變了導致內容過時 → 更新對應小節（附驗證過的 檔案:行號） |
| [JUDGMENT.md](JUDGMENT.md) §2 checklist | 新增任務型態的 checklist；修正被證實錯誤的條目 |
| [PROMPTS.md](PROMPTS.md) | 依實際踩雷微調範本欄位 |
| docs/ARCHITECTURE.md、FEATURES.md、CHANGELOG.md | 照 docs/README.md 既有慣例維護 |

自行改的前提：改動理由要能指到證據（程式碼、官方文件、或 LESSONS.md 條目），不能是「我覺得這樣更好」。

## 2. 哪些動之前必須先問使用者

- **CLAUDE.md**：新增/刪除硬規則、改結構。錯字或壞連結可直接修。上限 150 行是硬約束——要加內容就得同時說明擠掉什麼。
- **[DISPATCH.md](DISPATCH.md) 的升降級規則與模型對照表**（含 JUDGMENT.md §1 引用的同一份門檻）：這是花錢策略，屬使用者的預算決定。
- 新建 `.claude/agents/*.md`、改 `.claude/settings*.json`（permissions、effortLevel）。
- 刪除任何制度檔或 [archive/](archive/) 內的備份。

## 3. 踩雷教訓寫回哪裡、什麼格式

寫進 [LESSONS.md](LESSONS.md)，**append 到檔尾**，一條一段：

```markdown
## 2026-07-04 · 一句話標題
- 情境：當時在做什麼
- 錯誤：實際發生什麼（附 檔案:行號 或指令輸出摘要）
- 教訓：下次照做的一句話規則
- 已回寫：無 ／ 或已把規則補進哪個檔的哪節
```

觸發時機（任一就寫）：使用者糾正了你；subagent 誤解了範本 prompt；驗證抓到「宣稱完成但沒完成」；發現制度檔內容與現實不符。
同一教訓重複出現第二次 = 它該從 LESSONS.md 升級成 JUDGMENT.md/CLAUDE.md 的正式規則（升級 CLAUDE.md 要先問，見 §2）。

## 4. 累積多長要精簡

- LESSONS.md 超過 **30 條或 200 行** → 做一次整併：重複主題合併、已升級成正式規則的條目刪除（在該條標「已回寫」後才可刪）、只留仍然會踩的雷。
- ARCH-NOTES.md 超過 **150 行** → 檢查是否混進了「結構描述」（那些該去 docs/ARCHITECTURE.md），這裡只留 gotchas。
- 每季（或使用者說「整理制度」時）：派一個 Explore agent 全面查核 CLAUDE.md + docs/claude/* 的路徑與主張是否仍為真（照 PROMPTS.md §1/§5 範本），過時就修。
- 精簡屬於「動制度」——LESSONS.md 整併可自行做，其餘檔案的精簡先問使用者。

## 5. 已知的長期收斂方向（待使用者點頭才動）

- ARCH-NOTES.md 與 docs/ARCHITECTURE.md 各有部分重疊主題：長期可把 gotchas 併入 ARCHITECTURE.md 各節再刪 ARCH-NOTES.md，但要整份人工過目，不是機械合併。
- `.claude/agents/` 目前為空：若常用固定的審查/搜尋 agent 配置（含 `effort` frontmatter），可建定義檔省去每次寫 prompt——屬設定變更，先問。
