# UX 改善項目（第四輪）

> **進行中：第 1–3 項已上線並通過實測；第 5 項（轉帳付款人與收款人相同）已完成、待上線實測；第 4 項待實測；第 2 項既有資料待查核。** 來源：2026-09-17 外部工具（ChatGPT）以 Test 帳號在桌面瀏覽器實測第三輪改善後的回饋。
> 第三輪清單與實測結果見 [UX 改善項目（第三輪，已結案）](archive/history/UX_IMPROVEMENTS_ROUND3_2026-09-17.md)。
> 現行行為見 [現有功能](FEATURES.md)。結案後依 [維護方式](README.md#維護方式) 移入 `archive/history/`。

## 第三輪實測結論

第三輪 4 項（金額尾數、結算空白狀態、草稿切換說明、地圖統計標籤）都已在畫面上確認生效；
第二輪未能驗證的「新增飛行紀錄」表單也能開啟並選取機場。這一輪的問題集中在飛行表單與預付款文案，
另外要把「儲存之後」的帳務流程完整走一次。

## 回饋摘要

| # | 主題 | 問題 | 優先度 | 狀態 |
| --- | --- | --- | --- | --- |
| 1 | 機場搜尋排序 | 輸入 `TPE`，第一筆是 MPL（Montpellier），TPE 排第二 | ① | 已完成 |
| 2 | 起訖機場相同 | 出發與抵達都選 TPE，沒有提示，儲存按鈕仍可按 | ② | 已完成（既有資料待查核） |
| 3 | 預付款文案 | 結算頁說可先登記訂金，但表單仍寫「登記一筆實際還款」 | ③ | 已完成 |
| 4 | 完整帳務流程驗收 | 輸入畫面已確認，儲存後的花費、預算、分帳、還款尚未走過 | ④ | 待處理 |
| 5 | 轉帳付款人與收款人相同 | 付款人、收款人都選 Test，沒有提示，「登記」仍可按 | ⑤ | 已完成（待上線實測） |

建議順序：1 → 2 → 3 → 5（已完成）→ 4。第 5 項改的是登記轉帳表單，先修再做第 4 項的完整帳務實測。
版型與配色不變，不增加新功能。

## 上線後實測結果（2026-09-17）

外部工具以 Test 帳號在正式環境重新驗證，第 1–3 項都通過；先前看到的舊文案是更新前的狀態，已排除。

| 項目 | 實測結果 |
| --- | --- |
| 1 機場搜尋排序 | 搜尋 `TPE`，桃園機場排第一 |
| 2 相同起訖機場 | 顯示「出發與抵達機場相同，請確認」，並停用儲存 |
| 3 轉帳文案 | 顯示「轉帳與還款紀錄／登記轉帳」；表單說明包含預付款、不會新增旅遊支出 |

這輪沒有新增任何正式紀錄。接續測試發現與第 2 項同類的防錯缺口，列為第 5 項。

---

## 1. 機場搜尋優先顯示代碼完全吻合

**實測**：輸入 `TPE`，結果依序是：

1. MPL — Montpellier
2. TPE — 桃園機場

知道代碼的人預期第一筆就是答案，現在容易選錯。

**改善前行為**（2026-09-17 核對）：[AirportCombobox.tsx](../src/components/collections/AirportCombobox.tsx)
以「代碼前綴 或 名稱包含 或 城市包含」過濾後，直接依目錄原順序 `slice(0, MAX_RESULTS)`，沒有排序。
MPL 會出現是因為名稱或城市字串含 `tpe`（例如 Montpellier）。另一個風險是先截斷再顯示：
目錄前面的名稱吻合可能把代碼吻合擠出結果清單。

**建議**：過濾後、截斷前依吻合程度排序。

| 順位 | 條件 |
| --- | --- |
| 1 | 代碼完全吻合 |
| 2 | 代碼前綴吻合 |
| 3 | 城市開頭吻合、名稱開頭吻合 |
| 4 | 城市／名稱包含 |

同一順位內維持目錄原順序，排序結果必須穩定。

**完成條件**

- 輸入 `TPE`／`tpe` 第一筆是 TPE；輸入 `TP` 時代碼前綴吻合排在名稱包含之前。
- 代碼吻合的結果不會因為 `MAX_RESULTS` 截斷而消失。
- 補測試涵蓋上述排序與大小寫。

**實作結果**（2026-09-17）

- 過濾與排序抽成純函式 `searchAirports`（[airportSearch.ts](../src/lib/airportSearch.ts)），依上表四個順位排序後才截斷到 50 筆；
  同順位維持目錄原順序。[AirportCombobox.tsx](../src/components/collections/AirportCombobox.tsx) 改用此函式，過濾範圍不變。
- 以實際目錄核對：`TPE` 依序為 TPE、MPL；`TP` 前段為 TPA、TPE、TPI 等代碼前綴吻合。
- 測試：[airportSearch.test.ts](../src/__tests__/airportSearch.test.ts) 涵蓋代碼完全吻合、大小寫與前後空白、
  前綴／開頭／包含的順位、名稱吻合填滿上限時代碼吻合不被擠出，以及空白查詢。

**驗證結果**（2026-09-17）

- `airportSearch.test.ts` 的 5 項測試全部通過；TypeScript、相關檔案 ESLint 與 `git diff --check` 通過。
- 直接使用實際機場目錄執行搜尋：`TPE`、`tpe` 與前後含空白的 ` tpe ` 均依序回傳 TPE、MPL；
  `TP` 前段為 TPA、TPE、TPI、TPJ、TPP、TPQ、TPS，確認代碼前綴優先。
- 已核對元件使用排序函式，且 `shouldFilter={false}` 保留搜尋結果順序；尚未進行瀏覽器互動驗收。

## 2. 起訖機場相同時立即提示

**實測**：出發與抵達都選 TPE，沒有警告，儲存按鈕仍可操作。回饋者沒有送出。

**改善前行為**（2026-09-17 核對）

- 前端 [FlightRecordDialog.tsx](../src/components/collections/FlightRecordDialog.tsx) 的停用條件只檢查
  航空公司、日期、起訖機場是否有值。
- 後端 `createFlightRecordSchema`（[validation.ts](../src/lib/validation.ts)）只驗代碼格式，
  **會接受起訖相同**；存下來的航線距離為 0，地圖上也畫不出航線。

**建議**

- 選到相同機場時，在抵達欄位下顯示「出發與抵達機場相同，請確認」，並停用儲存。
- 後端 schema 同步拒絕起訖相同（沿用 `validation.ts` 其他 `refine` 的寫法），避免繞過前端。
- 觀光飛行等特殊紀錄這一輪不做；若未來要支援，需要明確的例外選項，並說明不計航線與里程。

**既有紀錄處理規則**

- 新增與編輯一律檢查，既有的起訖相同紀錄在下次編輯儲存時，須由使用者修正機場；即使只改備註也適用。
  目前更新沿用新增 schema，維持同一套驗證規則。
- 保留既有資料，不自動刪除或猜測正確機場，也不在讀取時阻擋清單與地圖。使用者仍可取消編輯或刪除紀錄。
- 開啟這類舊紀錄的編輯表單時，立即顯示「這筆紀錄的出發與抵達機場相同，請修正後再儲存」，
  並停用儲存；修正成不同機場後才恢復儲存。
- 實作前查核既有資料是否有此情況，記錄查核結果；目前尚未查核，不能假設沒有舊資料。

**完成條件**

- 前端即時提示並停用儲存；後端回傳驗證錯誤，前端顯示對應訊息。
- 新文案補齊四種語系；補前端與 schema 測試。
- 測試既有起訖相同紀錄：開啟編輯即提示、未修正無法儲存、修正後可儲存，取消與刪除仍可使用。
- 從行程活動一鍵帶入時，若標題解析出相同機場（例如 `TPE-TPE`），開啟表單即顯示同一提示並停用儲存。

**實作結果**（2026-09-17）

- 後端：`createFlightRecordSchema`（[validation.ts](../src/lib/validation.ts)）加上 `refine`，起訖相同（不分大小寫）時
  在 `to_airport` 回傳驗證錯誤；`updateFlightRecordSchema` 沿用同一個 schema。action 仍回 `VALIDATION_ERROR`，
  前端顯示既有的「輸入資料有誤」訊息；正常操作會先被前端擋下，不會走到這一步。
- 前端：[FlightRecordDialog.tsx](../src/components/collections/FlightRecordDialog.tsx) 在抵達欄位下顯示提示並停用儲存，
  送出 handler 也同樣擋下。新增與一鍵帶入顯示 `flights.sameAirport`；編輯原本就相同的紀錄顯示
  `flights.sameAirportExisting`。修正成不同機場後提示消失、恢復儲存。四種語系已補。
- 測試：[flightRecordSameAirport.test.tsx](../src/__tests__/flightRecordSameAirport.test.tsx) 涵蓋即時提示、`TPE-TPE` 帶入、
  舊紀錄未修正無法送出、修正後可儲存；[validation.test.ts](../src/__tests__/validation.test.ts) 補 schema 測試。
  刪除在清單操作、不經表單，行為未變；取消沿用表單既有的關閉方式。
- **既有資料查核：尚未完成。** 本機 `.env` 的 `MONGODB_URI` 是佔位值，連不到實際資料庫。
  請在正式環境以唯讀查詢確認筆數：
  `db.flightrecords.countDocuments({ fromAirport: { $ne: null }, $expr: { $eq: ['$fromAirport', '$toAirport'] } })`

**驗證結果**（2026-09-17）

- 表單、schema、行程帶入、收藏統計與地圖航線共 5 個測試檔、81 項測試全部通過；TypeScript、相關檔案 ESLint 與 `git diff --check` 通過。
- 補測舊紀錄即使無法儲存，仍可關閉且不觸發寫入；已核對刪除 action 不經新增／編輯 schema，讀取流程未改動。
- 新增與編輯 action 均在資料庫操作前套用 schema，無法繞過前端保存相同機場。
- 本機資料庫設定確為佔位值，既有資料筆數仍待正式環境唯讀查核；尚未進行瀏覽器互動與實際資料庫儲存／刪除驗收。

## 3. 預付款：表單文案與結算頁說明接上

**實測**：結算頁的空白提示已說明訂金或代墊款可以先登記（第三輪第 2 項），但點進去表單仍寫：

> 登記一筆實際還款，餘額會自動扣除這筆款項。

尚未產生欠款的人會不確定是否用對功能；「已結清紀錄」這個標題也不涵蓋預付款。

**改善前行為**（2026-09-17 核對）

- 相關字串：`settlement.recordPayment`（登記還款）、`recordPaymentDescription`、`paymentHistory`（已結清紀錄）、
  `paymentHistoryEmpty`、`paymentRecorded`、`deletePayment`、`deletePaymentConfirm`；
  使用於 [PaymentHistory.tsx](../src/components/settlement/PaymentHistory.tsx)、
  [RecordPaymentDialog.tsx](../src/components/settlement/RecordPaymentDialog.tsx)。
- 計算規則：還款只經 `applyPayments`（[settlement.ts](../src/lib/settlement.ts)）調整結算餘額，
  不計入已付款、應分攤，也不會新增支出。因此表單可以寫「不會新增旅遊支出」。

**建議文案**

| 位置 | 建議 |
| --- | --- |
| 紀錄區標題 | 轉帳與還款紀錄 |
| 按鈕／表單標題 | 登記轉帳 |
| 表單說明 | 記錄旅伴間已實際支付的款項，包含還款與預付款；結算會一併計入，不會新增旅遊支出。 |

**文案統一範圍**

- 通知、動態紀錄、推播與 Email 一併改用「轉帳」，與表單一致，避免預付款被描述成還款。
  成功提示、刪除按鈕／確認、空白提示及無障礙標籤也納入；四種語系同步。
- `notifications.paymentRecorded`、`activity.paymentRecorded` 統一為「{actor} 登記了一筆轉帳」；
  成功提示為「已登記轉帳」，刪除操作為「刪除轉帳紀錄」（避免誤解為取消實際轉帳）。
- 空白提示：`paymentHistoryEmpty` 為「尚無轉帳紀錄」；`paymentHistoryNoExpenses` 為
  「尚無轉帳紀錄。出發前先轉給旅伴的訂金或代墊款，也可以先登記。」
- 刪除確認：`deletePaymentConfirm` 為「確定要刪除這筆轉帳紀錄嗎？刪除後餘額會重新計入這筆款項。」
- `email.payment_recorded.*` 的主旨為「「{tripName}」有一筆轉帳紀錄」、標題為「有一筆與你相關的轉帳」、
  內文為「{actor} 在「{tripName}」登記了一筆與你有關的轉帳。」。
- 只調整顯示文案，保留既有翻譯 key、`payment_recorded` 事件類型與資料結構；不改帳務計算、不新增款項分類。
  舊通知與動態依翻譯重新顯示時也會使用新文案；已寄出的 Email 與已送達推播不回溯修改或重送。
- 結算方案裡的「標記已付」「我已付款」是針對建議轉帳的操作，維持原文案。
- 催收與結清情境維持「還款」：`remind`（提醒還款）、`reminderSent`（已發送還款提醒）、
  `allSettledHint`（還款都已登記，大家互不相欠。）針對實際欠款，不做全域取代。

**完成條件**

- 標題、按鈕、表單說明、成功與刪除提示、通知、動態、推播及 Email 用詞一致，四種語系同步。
- 檢查 [settlementEmptyStates.test.tsx](../src/__tests__/settlementEmptyStates.test.tsx) 等相關測試，
  更新舊文案斷言；既有翻譯 key 保留。驗證預付款登記後的通知與 Email 不再稱為「還款」。

**實作結果**（2026-09-17）

- 只改四種語系的顯示文案，翻譯 key、`payment_recorded` 事件類型、資料結構與結算計算都沒動：
  `settlement.recordPayment`、`recordPaymentDescription`、`paymentHistory`、`paymentHistoryEmpty`、
  `paymentHistoryNoExpenses`、`paymentRecorded`、`deletePayment`、`deletePaymentConfirm`，
  `notifications.paymentRecorded`（推播共用）、`activity.paymentRecorded`，以及 `email.payment_recorded.*`。
- 另把設定頁 Email 通知說明（`emailHelp`）的「登記還款」改為「登記轉帳」，與通知一致。
- 英文用 transfer，日文用「送金」，簡中用「转账」。`remind`、`reminderSent`、`allSettledHint`、
  還款提醒 Email、「標記已付」「我已付款」依規則維持原文案。
- 前端測試以 key 斷言，不受文案影響；[emailTemplates.test.ts](../src/__tests__/emailTemplates.test.ts) 補四語系
  `payment_recorded` Email 使用轉帳用詞、不含舊詞，[webpush.test.ts](../src/__tests__/webpush.test.ts) 補中文推播不含「還款」。

**驗證結果**（2026-09-17）

- Email 模板、推播與結算空白狀態共 3 個測試檔、40 項測試全部通過；TypeScript、相關測試檔 ESLint 與 `git diff --check` 通過。
- 四語系各更新相同的 14 個文案 key，既有 key 與插值參數完整保留；催收、結清與「標記已付」「我已付款」文案未變。
- 已核對表單、成功提示、刪除確認與無障礙標籤、通知鈴鐺、動態紀錄及推播使用對應翻譯；帳務程式未改動。
- 尚未進行瀏覽器操作、實際預付款登記及 Email／推播送達驗收；目前驗證涵蓋文案引用與訊息產生。

## 5. 登記轉帳時付款人與收款人相同

**實測**：在登記轉帳表單選付款人 Test、收款人 Test、金額 NT$10，畫面沒有提示，「登記」仍可按。
回饋者沒有送出，所以只確認送出前缺少防錯。

**改善前行為**（2026-09-17 核對）

- 前端 [RecordPaymentDialog.tsx](../src/components/settlement/RecordPaymentDialog.tsx)：兩個下拉選單都列出全部成員；
  「登記」只在儲存中停用。**按下登記後** handler 才檢查，顯示 `settlement.errorSamePerson`（付款人與收款人不能相同），不會送出。
- 後端 `recordPaymentSchema`（[validation.ts](../src/lib/validation.ts)）已用 `refine` 拒絕 `from_id === to_id`，
  [payment.actions.ts](../src/actions/payment.actions.ts) 在寫入前套用 schema，**不會存下自己付給自己的紀錄**。
- 缺口只在送出前：沒有即時提示、按鈕可按，與第 2 項修好前的機場表單一樣。目前沒有測試涵蓋這個情況。

**建議**

- 選定付款人後，收款人選單不列出同一人（反之亦然，或只處理收款人，擇一並保持一致）。
- 若更改付款人導致兩者相同（例如由建議轉帳預填後再調整），收款人欄位下立即顯示提示，並停用「登記」；
  改成不同成員後恢復。提示沿用 `errorSamePerson` 或新增較口語的 key，新 key 須補齊四種語系。
- 送出 handler 與後端 schema 的檢查保留，不改帳務計算與資料結構。
- 只有一位成員時沒有可選的收款人，確認表單有合理的提示，不出現空白選單卻可送出。

**完成條件**

- 無法在送出前選出相同的付款人與收款人；若透過預填或切換變成相同，即時提示並停用登記。
- 補前端測試：即時提示與停用、改回不同成員後可登記、直接送出表單仍被擋下；補 `recordPaymentSchema` 拒絕相同 id 的測試。

**實作結果**（2026-09-17）

- 前端 [RecordPaymentDialog.tsx](../src/components/settlement/RecordPaymentDialog.tsx)：選定付款人後，收款人選單不列出同一人
  （只處理收款人這一側）。若預填或改選付款人造成兩者相同，收款人選單暫時保留該成員，讓衝突看得見；
  表單上方立即顯示 `settlement.errorSamePerson`，並停用「登記」，改成不同成員後提示消失、恢復可按。
  提示沿用表單既有的錯誤區塊位置，沒有另外放在收款人欄位下。
- 只有一位成員時顯示新增的 `settlement.errorNeedTwoMembers`（至少需要兩位成員才能登記轉帳）並停用「登記」；四種語系已補。
- 送出 handler 保留相同成員檢查，並補上成員不足的檢查；後端 schema、帳務計算與資料結構未改。
- 測試：[recordPaymentSamePerson.test.tsx](../src/__tests__/recordPaymentSamePerson.test.tsx) 涵蓋收款人選單排除付款人、
  預填相同即提示並停用、直接送出仍被擋、改回不同成員後可登記、改選付款人造成相同、單一成員；
  [validation.test.ts](../src/__tests__/validation.test.ts) 補 `recordPaymentSchema` 測試。
  還原元件修改時新測試 4 項全數失敗，套用後通過；`tsc`、lint、format 與全部測試通過。
- 尚未在瀏覽器實際操作；上線後請以 Test 帳號重測原案例（付款人 Test、收款人 Test），不需要真的送出。

## 4. 完整帳務流程驗收

**目的**：目前只確認輸入畫面，儲存後各頁的數字還沒一起走過。以固定案例實測，不改程式；
發現問題再另開項目。

**驗收案例**：A、B 兩人，預算各自設定。

| 步驟 | 操作 | 預期結果 |
| --- | --- | --- |
| 1 | A 付 NT$123，兩人均分 | 支出詳情每人 NT$61.5；A 待收 NT$61.5、B 待付 NT$61.5 |
| 2 | 查看預算列與個人統計 | A、B「我的花費」都是 NT$61.5，預算餘額各扣 61.5 |
| 3 | B 登記轉帳 NT$61.5 給 A | 雙方待收／待付歸零，顯示已全部結清 |
| 4 | 再查看預算列與個人統計 | 我的花費仍各為 NT$61.5，不因還款改變 |
| 5 | 刪除該筆還款 | 餘額恢復步驟 1 的狀態 |

**狀態**：尚未進行，是下一個重要驗收；單看表單不能確認整段帳務正確。第 5 項已完成，上線後可與第 5 項重測一起進行。

**同時檢查**：重新整理與切換分頁後金額不變；結算 CSV 匯出的分攤金額與畫面一致（匯出目前不含還款紀錄，見 [exporters/settlement.ts](../src/lib/exporters/settlement.ts)）。

---

## 待驗證（沿用前幾輪）

以下項目尚未實測，不能列為已通過：

- 手機鍵盤、離線後同步。
- 地圖統計標籤在窄螢幕與英文、日文下是否被截斷。
- 新增飛行紀錄實際儲存後，清單與地圖航線是否正確更新。
