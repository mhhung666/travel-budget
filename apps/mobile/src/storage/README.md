# Native 儲存邊界

`credentials.ts` 使用 Expo SecureStore 原子保存單一目前帳號的 refresh token 與最後一次線上驗證的 user，key 包含 API 位址的 SHA-256，以隔離環境；切換帳號先登出並清除該 slot。iOS 使用 WHEN_UNLOCKED_THIS_DEVICE_ONLY。

access token 與帳務查詢快取只放記憶體；本機身分只存 SecureStore，不代表線上登入有效。舊格式 refresh token 可線上升級，本機身分缺失時不能離線冷啟動。Web 預覽不保存憑證，登入停用，也沒有資料庫。尚無持久化查詢或完整離線 outbox。

`pendingExpenses.ts` 是待確認支出的 SQLite 紀錄（`expo-sqlite`，資料庫 `travel-budget-pending.db` 在 App 私有儲存）：以 `(environment, account_id, client_request_id)` 為主鍵，保存旅行、凍結的請求內容與狀態，不含 token；所有讀寫都帶環境與帳號。它獨立於查詢快取，登出、換帳號與清除快取都不會刪除，只有伺服器明確回答後才移除。`expenseDatabase.ts` 集中以 `PRAGMA user_version` 與交易管理版本，來自較新 App 的資料庫會被拒絕而不是改寫。內容已不是有效請求的資料列會被略過，不被改寫或刪除。SQL 寫在小型資料庫介面之後，測試用 Node 內建 SQLite 執行同一份 SQL；`pendingExpenseDatabase.ts` 開啟實際資料庫，Web 預覽改用 `.web.ts` 版本（不引入 `expo-sqlite`）。

完整離線 outbox（階段 4）沿用同樣的隔離原則，不能被清除查詢快取一併刪除。更多要求見 [後端契約](../../docs/BACKEND_CONTRACT.md)。

`expenseDrafts.ts` 定義只包含原始表單的本機 schema；它允許未完成金額／日期，不包含 HTTP 預覽、分攤結果或憑證。草稿表按環境／帳號／旅行隔離，每個範圍保留一份，UUID／修訂號防止亂序覆寫，捨棄與成功的 tombstone 防止晚到寫入復活。

草稿交給 C 的 pending 建立與來源狀態改變在同一 SQLite 交易；結案也以交易清理，明確拒絕才恢復原始輸入。所有共用連線操作序列執行，不把 C 的查詢混入交接交易。真 SQLite 測試涵蓋舊表升級、檔案重開、修訂／捨棄競態、寫入與清理失敗，以及子程序在交接交易前後直接結束；測試不代替 iOS／Android 裝置驗收。

`draftTrips.ts` 定義版本 3 的最小旅行快照：按環境／帳號／旅行保存名稱、成員／分類選項與更新時間。拒絕標記清空快照私人內容但保留 D1 原始輸入；旅行名稱讀取不能解除拒絕，只有新選項成功保存才可恢復。共用同一 SQLite 連線與序列；Web adapter 仍不載入 SQLite。本機身分、草稿與快照的操作邊界見 [架構](../../docs/ARCHITECTURE.md#受限離線入口d2)。
