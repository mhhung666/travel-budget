# 同趟旅行金額一致性驗收（2026-09-16）

## 結論與範圍

**第五輪缺口已修正並通過本機與實際 MongoDB 複驗；另修正預算分攤累加遺漏。正式旅行與瀏覽器驗收仍待確認（見文末）。** 本次以本機程式檢查、計算函式測試及
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
- [x] 支出、預算、群組統計、結算及匯出在同幣別、同範圍下總額一致（第四輪修正：聚合改用 `roundMoneyExpr`，與 `roundMoney` 同源）。
- [x] 將四輪共十一項案例加入永久測試並通過。
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

## 第四輪驗收（2026-09-16）

**前三輪十項案例的本機回歸通過；完整金額一致性仍有舊資料缺口。**

重跑前輪相同的 11 個測試檔，**164 項全部通過**；另跑 `tripShellLoading` 與
`tripShellHydration` 共 6 項通過，合計 **13 檔、170 項通過**。後兩檔並未覆蓋實際 MongoDB 取整。
其中新增的三項永久測試確認：

| 案例 | 儲存分攤結果 |
| --- | --- |
| 新增 1,000，原分攤 500＋499.99 | 500.01＋499.99＝1,000 |
| 新增 10.01，原分攤 5.005＋5.005 | 5.01＋5.00＝10.01 |
| 更新 3,000，原分攤 1,500＋1,499.99 | 1,500.01＋1,499.99＝3,000 |

程式檢查確認新增及明確指定 splits 的更新都使用 `allocateShares`，新增 DTO 也使用同一份分攤。
上述 action 測試使用 mock 檢查資料庫寫入參數，並非實際資料庫寫入。

### 尚存缺口：舊資料的半分取整規則不同

[tripShellRead.ts](../../../src/lib/tripShellRead.ts) 的 `todaySpent` 與本人 `totalSpent`
在 MongoDB 聚合使用 `$round`；[settlementRead.ts](../../../src/lib/settlementRead.ts)
及統計則使用 [money.ts](../../../src/lib/money.ts) 的 `roundMoney`。
[MongoDB 官方規格](https://www.mongodb.com/docs/manual/reference/operator/aggregation/round/)
明確說明 `$round` 在正好一半時取最近偶數，與 `roundMoney` 的正數半分進位不同。

以既有支出的 `amount = 30.125`、本人 `shareAmount = 30.125` 為例：依官方規格，
預算聚合結果為 **30.12**；直接執行本機 `roundMoney(30.125)` 的結果為 **30.13**，
因此結算／統計與預算仍可相差一分。30.125 可被二進位精確表示，此例不依賴浮點近似誤差。
起初由程式與官方規格比對發現；後續已在獨立本機 MongoDB 實測確認（見下），未確認正式資料存在此案例。
新寫入已收斂到分的正常資料不受此半分案例影響。

已修正，見文末〈第四輪缺口的修正〉。

本輪未修改產品程式、未重跑全套測試、未查核正式資料與瀏覽器；原「成都重慶 NT$0」仍待確認。

### 第四輪續驗：實際 MongoDB 已重現

在全新 `/tmp/amount-fourth-audit.BWg6EP` 資料目錄啟動僅綁定 `127.0.0.1:27948`
的獨立 MongoDB，直接插入測試用成員、旅行及支出，呼叫實際 `readTripShell` 與
`readSettlement`；未連線正式資料庫，也未使用 mock 代替聚合。

| 同一筆支出／本人分攤原始金額 | 預算 total_spent | 今日 today_spent | 結算 totalExpenses | 本人 totalOwed |
| --- | --- | --- | --- | --- |
| 30.125（模擬舊資料） | 30.12 | 30.12 | 30.13 | 30.13 |
| 30.13（兩位小數對照組） | 30.13 | 30.13 | 30.13 | 30.13 |

兩個整合案例 **1 失敗、1 通過**；失敗斷言為同趟旅行的預算花費等於本人結算應分攤。
因此上述半分取整差異已由實際資料庫驗證，不只是規格推論。此補驗不代表正式資料有相同輸入，
也不能證明原 NT$0 案例已修復。

臨時測試 `amountFourthAudit.audit.test.ts` 已從專案移除，副本保留於上述暫存目錄；
獨立 MongoDB 已停止。沒有修改產品程式或提交 commit。


## 第四輪缺口的修正（2026-09-16）

### 根因

取整規則有兩套：走 MongoDB 聚合的讀取用 `$round`，走 JavaScript 的讀取用 `roundMoney`。
`$round` 是銀行家捨入（正好一半時取最近偶數），`roundMoney` 是四捨五入，兩者只在「正好半分」
的金額上分歧——而舊資料正好存得出 30.125 這種未收斂到分的換算金額。

### 修正

[money.ts](../../../src/lib/money.ts) 新增 `roundMoneyExpr`，把同一條規則表述成聚合運算式：
先 `$toDecimal`（MongoDB 轉 Decimal128 時取 15 位有效數字，等同 JS 端 `toPrecision` 消去
1.005 這類二進位表示誤差），再 `floor(x * 100 + 0.5)`——這正是 `Math.round` 的定義，含負數
一律朝 +∞ 進位。[tripShellRead.ts](../../../src/lib/tripShellRead.ts) 的 `todaySpent` 與本人
`totalSpent` 改用它，不再出現 `$round`。聚合端的取整自此與 `roundMoney` 逐筆逐分相同。

| 案例 | 修正前 | 修正後 | 永久回歸測試 |
| --- | --- | --- | --- |
| 舊資料 30.125：預算／今日花費 vs 結算／本人應分攤 | 30.12 vs 30.13 | 30.13 vs 30.13 | `amountConsistency.test.tsx`〈aggregation rounding matches roundMoney〉 |
| 兩位小數對照組 30.13 | 一致 | 一致 | 同上 |
| 欄位缺漏的支出 | — | 視為 0，不讓整條聚合失敗 | 同上 |

`amountConsistency.test.tsx` 以定點 BigInt 重算該運算式（Decimal128 語意），不需資料庫即可
比對 `roundMoney`；另新增 `moneyAggregation.integration.test.ts`，在實際 MongoDB 上跑同一
運算式，與既有整合測試一樣需 `MONGODB_QUEUE_TEST_URI` 與 `MONGODB_QUEUE_TEST_ALLOW_WRITES=1`
才會執行（預設略過）。

### 驗證

`npx tsc --noEmit`、`pnpm lint`、`pnpm format:check` 皆通過；`pnpm test:run` 為
**150 檔 1,522 項通過、11 檔 206 項略過**（略過者含需要獨立 MongoDB 的整合測試）。
本輪仍未查核正式資料、未做瀏覽器端到端驗收，原「成都重慶 NT$0」仍待確認。

## 第五輪驗收（2026-09-16）

**仍未完整通過；前輪精確半分案例已修正，另有兩項舊資料邊界不一致。**

驗證結果：前輪相同 11 個回歸測試檔 **176 項通過**；在全新獨立本機 MongoDB
啟用 `moneyAggregation.integration.test.ts`，**2 項通過**。
另以臨時整合測試插入測試資料、呼叫實際 `readTripShell`／`readSettlement`，
四個案例 **2 通過、2 失敗**（分兩次執行，第二次只跑多人分攤案例）。

| 案例 | 預算／今日花費 | 結算／本人應分攤 | 結果 |
| --- | --- | --- | --- |
| 單人成本與分攤 30.125 | 30.13 | 30.13 | 通過，上輪缺口已修正 |
| 單人成本與分攤 30.13 | 30.13 | 30.13 | 通過 |
| 單人成本與分攤 30.124999999999 | 30.12 | 30.13 | 失敗，近半分時仍差一分 |

### 1. 聚合與 JavaScript 消除浮點誤差的精度仍不同

[money.ts](../../../src/lib/money.ts) 的 `toCents` 先將金額乘 100，再取 **12 位有效數字**；
`roundMoneyExpr` 使用 `$toDecimal`，沒有等價的 12 位精度收斂。
因此不能視為相同規則：輸入 30.124999999999 時，JS 先把接近 3012.5 的值收斂成
3012.5 再進位，聚合則保留半分以下的差距。上表差異已由真實 MongoDB 讀取服務確認。
需統一完整的精度收斂與取整流程，永久整合測試也須涵蓋半分附近的值。

### 2. 舊資料多人分攤各自取整，總和仍可能超出支出

插入原本完全平衡的舊資料：支出 **30.25**，A、B 各分攤 **15.125**，A 付款。
實際 `readSettlement` 回傳總支出 **30.25**，兩人 `totalOwed` 各 **15.13**，
合計 **30.26**；餘額為 **+15.12、-15.13**，轉帳方案只有 B 還 A **15.12**。
依此方案執行仍會留下 B 應付一分、卻沒有對應收款人的差額。

原因是 [settlementRead.ts](../../../src/lib/settlementRead.ts) 對舊的每筆 shareAmount
各自 `roundMoney`，未按該筆支出分配尾差。新寫入的 `allocateShares` 修正無法回補這類舊資料。
需建立各讀取端共用的舊資料分攤正規化策略，或先完成可驗證的資料遷移；不能只修改結算顯示。

測試使用全新 `/tmp/amount-fifth-audit.mD2i2I` 資料目錄、僅綁定 127.0.0.1:27948，
未連線正式資料庫。臨時測試已從專案移除，副本保留於該暫存目錄；獨立 MongoDB 已停止。
本次未修改產品程式、未重跑全套、未做瀏覽器驗收；原 NT$0 案例仍未查核。

## 第五輪修正與實際資料庫複驗（2026-09-16）

本次依使用者要求修改產品程式，**已重現的近半分、舊分攤尾差與預算累加問題均通過複驗**。
驗收當時未修改正式資料、建立 commit、調整應用程式版本或部署；後續依使用者要求將修正與 patch 版本遞增一併提交。

### 修正內容

- `money.ts` 的 JS／MongoDB 取整都使用相同 double 運算順序，以 `|cents| × Number.EPSILON × 2`
  為容差，落在半分以下此誤差帶內也視為半分（並非純數學四捨五入），
  移除「12 位有效數字 vs Decimal128」的兩套規則。30.124999999999 兩邊均為 **30.12**，
  精確半分 30.125 兩邊均為 **30.13**，1.005 仍為 **1.01**。
- 新增 `normalizeShares` 與相同規則的 `normalizedSplitsExpr`：以已取到分的支出為基準，
  保留已平衡分攤；小額尾差用最大餘數法分配，同餘數由原始索引決定。
  餘數先收斂到十億分之一分，避免 JS／MongoDB 加總的微小誤差把一分分給不同成員。
- 預算 shell、結算、個人統計、群組統計、DTO 明細及三種匯出均使用正規化分攤。
  個人統計分頁在展開分攤之前正規化，因此金額排序與游標使用實際顯示金額；日期排序仍先用索引排序與限制筆數。
- 跨頁測試發現 `tripShellRead` 的 `$reduce` 遺漏 `$$value`，每次迴圈只留下當前成員的結果，
  本人不是最後一位時花費會變成 0。已改成真正累加，並逐位成員驗證。
  這是可造成 NT$0 的具體程式原因，尚未確認原「成都重慶」正式資料是否屬於同一案例。
- 上線預算修正是上述 `tripShellRead` 的 `$reduce`；`budget.ts` 的 `computeBudgetProgress`
  目前只有測試呼叫，其一致性改動本身沒有上線效果。

讀取時只修小額尾差，不寫回資料庫。原始分攤總和與已取整支出差額（取到分後）超過
`roundMoney(人數 × 0.005 + 0.01)` 時，保留各自取整值，不擅自重分大額異常或捏造缺少的參與人。
這類資料需要另行查核，不能宣稱任意損壞資料都能自動結清。

### 永久測試與結果

`moneyAggregation.integration.test.ts` 在全新、僅限 localhost 的 MongoDB 執行，9 項全部通過：

- 615 個取整輸入，包含半分上下、正負數及浮點誤差，比對 JS 與真實 MongoDB。
- 210 組分攤，比對兩邊的成員結果，包含 200 組不同權重、尾差、空分攤與大額異常保留。
- 6 組真實讀取服務測試：30.125、30.124999999999、30.25 分攤 15.125＋15.125、
  30 分攤 15＋15、10.01 分攤 5.005＋5.005、1,000 分攤 500＋499.99。
  每位成員的 shell、結算、個人統計 action、群組統計、DTO、預算與統計分頁一致，
  並確認按轉帳方案套用還款後所有人餘額歸零。僅認證 session 使用測試替身，資料讀取及聚合為真實 MongoDB。
- 缺漏 amount 欄位仍回傳 0。

另有永久匯出測試確認三種格式分攤為 15.13＋15.12，且不修改輸入資料。
刪除原以 BigInt 模擬聚合的測試替身，改由實際 MongoDB 驗證運算語意。

驗證紀錄：全套 150 檔 **1,514 項通過**、11 檔 213 項依環境略過；最後小額容差調整及新增
匯出案例後重跑受影響 11 檔，**156 項全部通過**（其中含已啟用的 9 項 MongoDB 整合測試）。
`tsc --noEmit`、lint、format 檢查通過。正式資料及瀏覽器端到端驗收未執行。

### 審查後補強

- CI 增加獨立 MongoDB service job，每次 master push / PR 必跑 9 項真實聚合整合測試，
  不依賴 secret 或手動設定環境。一般本機 `pnpm test:run` 仍略過此組；採用 CI 預設真實 DB
  方案，未恢復 BigInt 求值器。新增兩個相對 epsilon 邊界，本機單元測試也會預設驗證。
- JS 與聚合的尾差上限統一以 `MONEY_EPSILON` / `SPLIT_TOLERANCE` 表達。
- `toExpenseDto` 不會修改輸入或寫 DB，但編輯表單取 DTO 分攤反算原幣，送出時重新計算，
  server action 以 `roundMoney(original_amount × exchange_rate)` 儲存 TWD，因此一次正常儲存
  可能將舊精度收斂。`ExpenseListItem` 確實並列原幣、TWD 與匯率，未宣稱乘積未取整仍相等。
  已補 DTO 回歸案例；表單反算精度與正式瀏覽器驗收另列待辦。
- Migration 尚未實作、讀取熱路徑仍重算；具體範圍與驗收條件已列入
  [目前待辦](../../UX_IMPROVEMENTS.md#待確認)。

本輪驗證：全套 **1,517 項通過、213 項略過**；另啟用獨立本機 MongoDB，受影響 4 檔
**48 項通過**（含 9 項真實 DB 測試、617 個取整輸入）。型別、lint、format 與 diff 檢查通過。
測試資料庫已刪除且本機 MongoDB 已停止。GitHub service job 已設定，遠端 CI 尚未執行。
