# 同趟旅行金額一致性驗收（2026-09-16）

## 結論與範圍

**三輪驗收共十項缺口，皆已修正並補上永久回歸測試（見文末〈第三輪缺口的修正〉）。** 本次以本機程式檢查、計算函式測試及
React 元件渲染測試驗收，重現四項金額不一致；修正內容見下方〈修正〉。
未連線查核正式資料、未做瀏覽器端到端驗收，因此仍不能據此判定「成都重慶預算列 NT$0」的成因或修復狀態。

## 已重現問題

| 項目 | 輸入與重現方式 | 預期 | 實際 |
| --- | --- | --- | --- |
| 分攤容差留下無法結清的餘額 | TWD 1,000 元由 A 付款，指定 A 分攤 500、B 分攤 499；呼叫 `computeSplits`，再計算結算方案並套用還款 | 不接受未分配完的分攤，或明確分配尾差；有效帳目依方案還款後應歸零 | `balanced = true`；B 還 A 499 後，A 仍有 1 元應收，無對應債務人 |
| 群組統計總額少算小數 | 同趟旅行兩筆支出：餐飲 100.4 元、交通 200.4 元，呼叫 `computeTripStats` | 總額等於支出加總 300.8 元 | 各分類先取整再加總，結果為 300 元 |
| 每日花費加總不足 | 100 元住宿關聯三個行程日，呼叫 `computeTripStats` | 每日分配加總等於 100 元 | 每天各 33 元，加總 99 元 |
| 結算摘要與明細精度不同 | `SettlementSummary` 傳入本人餘額 -50.2 元、應分攤 50.2 元 | 應付摘要保留 50.2 元，與明細一致 | 頁首應付顯示 NT$50；明細金額保留 NT$50.2 |

### 對應程式與原因

- [expenseSplit.ts](../../../src/lib/expenseSplit.ts)：`computeSplits` 允許至少 0.02 原幣或總額 0.1% 的差額，判定平衡後未分配差額。
- [expense.actions.ts](../../../src/actions/expense.actions.ts)：`splitsMatchAmount` 另允許至少 1 TWD 或總額 1% 的差額；上述少分攤 1 元的案例也符合此條件。這部分為程式檢查，未以正式資料寫入驗證。
- [tripStats.ts](../../../src/lib/tripStats.ts)：分類總額先 `Math.round`，`totalAmount` 再加總已取整的分類；每日分配也各自取整而未處理尾差。
- [SettlementSummary.tsx](../../../src/components/settlement/SettlementSummary.tsx)：本人應收／應付先 `Math.round`，其他明細則直接使用可顯示兩位小數的 `formatCurrency`。

## 測試證據

既有相關測試共 **10 個檔案、146 項通過**：

```sh
pnpm exec vitest run \
  src/__tests__/tripStats.test.ts \
  src/__tests__/budget.test.ts \
  src/__tests__/expenseSplit.test.ts \
  src/__tests__/settlement.test.ts \
  src/__tests__/settlement.actions.test.ts \
  src/__tests__/expense.actions.test.ts \
  src/__tests__/exporters.test.ts \
  src/__tests__/tripCurrency.test.ts \
  src/__tests__/expenseMutations.test.tsx \
  src/__tests__/optimisticExpense.test.ts
```

額外以臨時測試 `amountAcceptance.audit.test.tsx` 驗證上表四項不變條件，**4 項全數失敗**：

```text
統計總額：expected 300.8，received 300
每日加總：expected 100，received 99
還款後餘額：expected [0, 0]，received [1, 0]
應付摘要：expected NT$50.2，received NT$50
```

臨時測試已移除；以上保留案例與結果，修正時需補入永久回歸測試。既有測試通過不代表跨頁金額一致性通過。

## 修正（2026-09-16）

共同規則集中在 [money.ts](../../../src/lib/money.ts)：資料層一律保留到「分」，不在中途取整；
要把一筆金額拆進多個桶時走 `allocateMoney`（最大餘數法），拆出來的加總剛好等於原金額；
分攤平衡容差 `SPLIT_TOLERANCE` 固定一分，只吸收小數位誤差。

| 原問題 | 修正 |
| --- | --- |
| 分攤容差留下無法結清的餘額 | [expenseSplit.ts](../../../src/lib/expenseSplit.ts) 容差由「至少 0.02 或 0.1%」收緊為 `SPLIT_TOLERANCE`，1,000 元分攤 500／499 判定為 under；判定平衡者一律重新以最大餘數法分配，原幣與 TWD 加總都剛好等於總額。[expense.actions.ts](../../../src/actions/expense.actions.ts) 的 `splitsMatchAmount` 改用同一容差與比較方式，前後端一致 |
| 群組統計總額少算小數 | [tripStats.ts](../../../src/lib/tripStats.ts) 改以 `roundMoney` 保留到分，`totalAmount` 由同精度的分類加總；[stats.actions.ts](../../../src/actions/stats.actions.ts) 的個人統計同步處理 |
| 每日花費加總不足 | 每筆支出以 `allocateMoney` 拆給關聯行程日（100 元三天 → 33.34／33.33／33.33），每日加總等於總額 |
| 結算摘要與明細精度不同 | [SettlementSummary.tsx](../../../src/components/settlement/SettlementSummary.tsx) 頁首移除 `Math.round`；[ExpenseListItem.tsx](../../../src/components/trips/detail/ExpenseListItem.tsx) 的分攤標籤同步 |

連帶把預算與預算列改為同精度（[budget.ts](../../../src/lib/budget.ts)、
[tripShellRead.ts](../../../src/lib/tripShellRead.ts)），否則同一筆錢在預算列與結算頁仍會差一元。
`avgPerPersonPerDay` 是平均值、不參與任何加總，維持整數。

四項案例已成為永久回歸測試 [amountConsistency.test.tsx](../../../src/__tests__/amountConsistency.test.tsx)。


## 再次驗收（2026-09-16）

**原四項回歸案例通過，整體仍未通過。** 本次重跑前述 10 個測試檔加上
`amountConsistency.test.tsx`，共 **11 檔、155 項通過**。此數字為本次實際執行範圍，非全套測試。

進一步補驗後端寫入與結算邊界，**新增 3 項驗收斷言全部失敗**：

| 缺口 | 重現方式與實際結果 | 待修位置 |
| --- | --- | --- |
| 後端仍接受未分配完的金額 | 呼叫 `createExpense`：TWD 1,000，分攤 500＋499.95。回傳成功，傳給資料庫的分攤合計仍為 999.95，留下 0.05 元差額 | `expense.actions.ts` 的 `splitsMatchAmount` 只判定容差，儲存時未分配尾差；更新流程也沿用此模式 |
| 換匯金額未在寫入時統一精度 | 呼叫 `createExpense`：USD 1、匯率 30.004、分攤 15＋15，儲存金額為 30.004。相同支出兩筆，群組統計逐筆取到分後為 60；結算原始加總 60.008 顯示為 60.01 | `expense.actions.ts` 新增／更新仍直接相乘；`settlementRead.ts` 與匯出仍加總原始金額，和 `tripStats.ts` 逐筆取到分不同 |
| 一分錢有餘額卻無轉帳方案 | `calculateSettlement` 傳入 A 應收 0.01、B 應付 0.01，回傳空陣列；結算摘要的結清門檻是絕對值小於 0.01，因此仍顯示待收／待付 | `settlement.ts` 排除剛好 ±0.01 的餘額，與兩位小數精度及摘要判定不一致 |

前兩項使用既有 `expense.actions.test.ts` 的 mock 建立臨時補驗，實際呼叫 server action 並
檢查傳入 `Expense.create` 的資料；沒有寫入真實資料庫。換匯案例再將該金額傳入
`computeTripStats`，與原始加總取到分的結果比較。第三項直接呼叫結算函式。
臨時檔 `amountReaudit.audit.test.ts` 已移除，保留上述輸入與結果供永久回歸測試使用。

下一次複驗須確認後端新增／更新都落實金額精度與完整分攤，並涵蓋恰好一分錢的結算。
既有多位小數資料的讀取策略也需一致，不能只修新資料。原「成都重慶 NT$0」線上案例仍未查核。

## 補驗缺口的修正（2026-09-16）

| 缺口 | 修正 | 回歸測試 |
| --- | --- | --- |
| 後端仍接受未分配完的金額 | 容差不再隨金額放大：`splitTolerance(amount)`（至少 1 分、或總額萬分之一）改為固定的 `SPLIT_TOLERANCE = 0.01`，前後端共用。1,000 元分攤 999.95 元現在退回 `VALIDATION_ERROR` | `expense.actions.test.ts`「shares that fall short by less than a dollar」 |
| 換匯金額未在寫入時統一精度 | 新增與更新都以 `roundMoney(original_amount × exchange_rate)` 儲存金額、`roundMoney` 儲存每筆分攤；「金額改變但未給 splits」的均分重算改走 `allocateMoney`。讀取端（[settlementRead.ts](../../../src/lib/settlementRead.ts)、[tripShellRead.ts](../../../src/lib/tripShellRead.ts) 的 `$round`、[exporters](../../../src/lib/exporters/expenses.ts)、`tripStats` 的成員分攤）一律逐筆取到分再加總，與統計同一種取整順序，既有多位小數資料也一致 | `expense.actions.test.ts`「rounds the converted amount and shares to cents」、`settlement.actions.test.ts`「rounds each expense to cents」 |
| 一分錢有餘額卻無轉帳方案 | 門檻改為半分錢 `MONEY_EPSILON = 0.005`：金額都已收斂到分，差額不是 0 就是至少 1 分，用 0.01 會把「剛好應收一分」排除。`calculateSettlement` 與 `SettlementSummary` 的結清判定共用同一門檻 | `amountConsistency.test.tsx`「a single cent is still settleable」 |

`applyPayments` 抵銷後的餘額同樣收斂到分，避免還款金額把餘額帶回多位小數。

驗證：`npx tsc --noEmit`、`pnpm lint`、`pnpm format:check` 通過；
`pnpm test:run` 為 150 檔 1,507 項通過、10 檔 204 項略過（全套執行）。

**部署注意**：後端分攤驗證收緊為固定一分。離線佇列中若有舊版產生、分攤未分配完的支出，
重送時會被擋下（`VALIDATION_ERROR`），需重新編輯金額或分攤後再送出。

## 複驗條件

- [x] 統一金額精度及尾差分配規則，避免先對分類或分攤各自取整造成總額改變。
- [x] 前後端分攤驗證一致；允許的尾差必須實際分配，不能只標記為平衡（第三輪修正：後端寫入前一律 `allocateShares`）。
- [x] 每日分配加總等於旅行總額；成員分攤加總等於支出總額（後端新增與更新的儲存結果均已驗證）。
- [x] 本人待收／待付的摘要、明細與轉帳方案使用一致精度，且恰好一分錢也排得出轉帳方案。
- [x] 支出、群組統計、結算及匯出在同幣別、同範圍下總額一致（匯出改為逐筆取到分再加總）。
- [x] 將三輪共十項案例加入永久測試並通過。
- [ ] 另以同一帳號、同一旅行及相同篩選範圍在瀏覽器驗證「我的花費」在預算、結算、個人統計的一致性，並追查原先 NT$0 案例。仍未查核正式資料。

標籤可重複涵蓋同筆支出，不應要求多個標籤桶相加等於旅行總額；個人花費也不應直接與全團總支出比較。


## 第三輪驗收（2026-09-16）

**仍未通過；後端分攤尾差未分配的根因尚未修完。** 原 11 個測試檔重跑，
共 **161 項通過**，包含上一輪「少分 0.05 元被拒絕」、「換匯逐筆取到分」及
「0.01 元可產生轉帳方案」的回歸測試。本次未重跑全套，未查核正式資料。

補驗同一個後端不變條件：任何成功寫入的支出，儲存後的分攤總和必須等於支出金額。
使用既有 action 測試 mock 呼叫實際 `createExpense`／`updateExpense`，檢查傳入資料庫的內容，
三個案例都回傳成功，但 **3 項金額一致性斷言全部失敗**：

| 操作 | 輸入 | 實際儲存分攤總和 | 支出總額 |
| --- | --- | --- | --- |
| 新增，少分一分 | TWD 1,000，分攤 500＋499.99 | 999.99 | 1,000 |
| 新增，各自取整後超額 | TWD 10.01，分攤 5.005＋5.005 | 10.02（各自取成 5.01） | 10.01 |
| 更新，少分一分 | 既有支出 3,000，指定分攤 1,500＋1,499.99 | 2,999.99 | 3,000 |

原因在 [expense.actions.ts](../../../src/actions/expense.actions.ts)：
`splitsMatchAmount` 仍接受差額 0.01；新增與明確傳入 splits 的更新流程，只對每人
`roundMoney`，沒有像前端或更新時未給 splits 的分支那樣實際分配尾差。
第二個案例甚至在取整前完全平衡，取整後才多出一分，因此不能只驗證原始輸入總和。

待修條件：後端新增與更新須在最終分攤產生後確認總和等於已取整支出；容差內若接受，
應採一致的尾差分配規則，不能只縮小容差或各自四捨五入。分攤相關事件資料也應使用同一份結果。
補上上述三項永久回歸案例後再驗收。

本次未修改產品程式；臨時測試 `amountThirdAudit.audit.test.ts` 已移除。
前述「皆已修正」為修正階段紀錄，不代表此輪完整驗收通過。原 NT$0 線上案例仍待確認。

## 第三輪缺口的修正（2026-09-16）

根因是「驗證」與「儲存」用了兩套規則：`splitsMatchAmount` 只判定總和落在一分容差內，
接受之後卻對每人各自 `roundMoney`——尾差既沒有被拒絕，也沒有被分配。

新增 `allocateShares(splits, amount)`（[expense.actions.ts](../../../src/actions/expense.actions.ts)），
在容差驗證通過後、寫入之前，以 `allocateMoney` 依原始分攤為權重重新分配，
使儲存的分攤總和剛好等於已取整的支出金額。新增與「明確傳入 splits」的更新都走這條路徑；
回傳的 DTO（事件、通知與樂觀更新的來源）使用同一份結果，不再各自取整。
此時差額必定在一分內，重分配動到任何人的金額都不超過一分。

| 案例 | 修正後儲存結果 | 回歸測試 |
| --- | --- | --- |
| 新增 TWD 1,000，分攤 500＋499.99 | 500.01＋499.99 ＝ 1,000 | `expense.actions.test.ts`「allocates the remainder for a share that ends in a stray cent」 |
| 新增 TWD 10.01，分攤 5.005＋5.005 | 5.01＋5.00 ＝ 10.01 | 同上「shares that both round up」 |
| 更新既有支出 3,000，分攤 1,500＋1,499.99 | 1,500.01＋1,499.99 ＝ 3,000 | `expense.actions.test.ts`「allocates the remainder of explicit splits when updating」 |

驗證：`npx tsc --noEmit`、`pnpm lint`、`pnpm format:check` 通過；
`pnpm test:run` 為 150 檔 1,510 項通過、10 檔 204 項略過（全套執行）。

仍未查核正式資料，原「成都重慶 NT$0」線上案例待瀏覽器驗證。
