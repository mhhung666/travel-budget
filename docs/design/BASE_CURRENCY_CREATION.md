# 新旅行：基準幣別選擇

每趟旅行在建立時選定一種帳本基準幣別。總額、分帳與結算都採用這個單位，建立後固定。支出的原幣、常用幣別與預設記帳幣別可另外設定。舊旅行缺少基準欄位時沿用 TWD。

## 建立與搜尋

- 「帳本基準幣別」放在名稱下方，預選 TWD，顯示代碼、本地化名稱與建立後無法更改的說明。候選來自後端 `supportedBaseCurrencies`。現行後端固定回傳 `nonTwdCreationEnabled: true`；舊後端或快取回傳 false 時，客戶端只允許清單中的 TWD。[後端能力](../../apps/web/src/lib/ledger.ts)
- Web 與 App 都可用代碼、四語名稱或英文名稱搜尋。空搜尋先列常用幣別，其餘依代碼排序；搜尋時依完整代碼、代碼前綴、其他命中排序。只有明確選取才更新，取消、清除、輸入法確認均保留原值。四語名稱無法取得時顯示代碼。[共用搜尋案例](../../test-fixtures/currency-selection.json)
- Web 桌面提供鍵盤單選，窄版在原表單內搜尋；App 使用可捲動的搜尋視窗。選項同時顯示代碼與名稱，支援已選狀態朗讀，關閉後回到原欄位。[Web 選擇器](../../apps/web/src/components/trips/CurrencyPicker.tsx) · [App 選擇器](../../apps/mobile/src/features/tripEntry/BaseCurrencyField.tsx)

### BC2b 表單狀態與原操作恢復

讀取或重查能力時保留已填資料並暫停建立。失敗可重試；若已選幣別從清單移除，保留選值並提示重新選擇。只有已選值也是唯一有效候選時，欄位才顯示唯讀。單獨改幣別也算表單有修改。

建立已確認、送出結果未知時，Web 與 App 都以原帳號、原請求 UUID 和原內容恢復。新能力清單只影響下一次確認；既有收據保留原結果。非 TWD 離線可存草稿，自動送出佇列限 TWD 基準、TWD 原幣且均分。[Web 建立表單](../../apps/web/src/components/trips/CreateTripDialog.tsx) · [App 建立表單](../../apps/mobile/src/features/tripEntry/TripFormScreen.tsx)

## 驗證與交接

Web 與 App 選擇器已交付。2026-10-13 使用者確認 BC3 驗收後，後端移除非 TWD 建立開關。實際操作涵蓋的平台、故障情境與限制見 [BC3 驗收紀錄](../../apps/mobile/docs/LOCAL_ACCEPTANCE.md#bc3-建立到首次記帳交接)。精確分攤、還款與跨端輸出的剩餘核對見 [B4 固定帳務案例](../../apps/mobile/docs/LOCAL_ACCEPTANCE.md#b4-固定帳務案例)。部署另行安排。

## 後續評估：在旅行設定變更基準幣別

2026-10-21 決定暫緩。旅行、支出及還款各自保存基準單位，私人預算、自訂匯率、分攤尾差與歷史收據也依賴原單位。若重啟評估，先定義空帳本的判準、其他裝置尚未送出的草稿與已確認操作如何處理，再評估有帳務的旅行。轉換需能與同旅行的寫入互斥，兼顧舊客戶端、公開讀取與歷史收據重播。[帳本驗證](../../apps/web/src/lib/ledger.ts) · [同旅行交易](../../apps/web/src/lib/tripWriteTransaction.ts)

## 優先修復：高精度匯率阻擋記帳提交

參考報價取倒數或跨基準換算時會產生長小數。Web 記帳及自訂匯率欄位已採 `step="any"`，避免瀏覽器拒絕有效值；預覽、寫入及重試保留完整匯率。應用仍檢查有限正數、同幣匯率 1 與金額上限。Chromium 提交與 App 相容回歸已完成；可用 `pnpm --filter @travel-budget/web test:offline-browser` 重跑。Safari／iOS 仍待核對展開與收合欄位時的長小數新增及描述編輯。[Web 記帳欄位](../../apps/web/src/components/trips/detail/expense-form/AdvancedFields.tsx) · [App 匯率解析](../../apps/mobile/src/features/expenses/input.ts)
