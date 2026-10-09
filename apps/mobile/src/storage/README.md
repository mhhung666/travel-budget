# Native 儲存邊界

`credentials.ts` 使用 Expo SecureStore 原子保存單一目前帳號的 refresh token 與最後一次線上驗證的 user，key 包含 API 位址的 SHA-256，以隔離環境；切換帳號先登出並清除該 slot。iOS 使用 WHEN_UNLOCKED_THIS_DEVICE_ONLY。

access token 與帳務查詢快取只放記憶體；本機身分只存 SecureStore，不代表線上登入有效。舊格式 refresh token 可線上升級；user schema 不相容只忽略本機身分，仍回傳有效 token，外層格式或 token 不合法仍報儲存錯誤。本機身分缺失時不能離線冷啟動。Web 預覽不保存憑證，登入停用，也沒有資料庫。未持久化帳務查詢；已確認的均分意圖以 D3 前景佇列保存。

`pendingExpenses.ts` 是待確認支出的 SQLite 紀錄（`expo-sqlite`，資料庫 `travel-budget-pending.db` 在 App 私有儲存）：以 `(environment, account_id, client_request_id)` 為主鍵，保存旅行、凍結的請求內容與狀態，不含 token；所有讀寫都帶環境與帳號。它獨立於查詢快取，登出、換帳號與清除快取都不會刪除，只有伺服器明確回答後才移除。`expenseDatabase.ts` 集中以 `PRAGMA user_version` 與交易管理版本，來自較新 App 的資料庫會被拒絕而不是改寫。內容已不是有效請求的資料列會阻擋讀取／新送出，不被改寫或刪除。SQL 寫在小型資料庫介面之後，測試用 Node 內建 SQLite 執行同一份 SQL；`pendingExpenseDatabase.ts` 開啟實際資料庫，Web 預覽改用 `.web.ts` 版本（不引入 `expo-sqlite`）。

`expenseQueue.ts` 的佇列沿用同樣的隔離原則，保存原始輸入、完整成員 ID 順序、UUID、狀態與最早重試時間，不含成員姓名或 token。確認來源草稿／tombstone、準備 C pending／鎖定佇列、C 結案／佇列清理各在同一交易；準備後不能修改或捨棄。未送出紀錄可原子移回新草稿世代，現有草稿僅在使用者另行明確確認時替換。版本 6 的 `expense_rate_limit` 以 `(environment, account_id)` 為主鍵，從版本 5 列內 `rate_limit_until` 遷移各範圍最大期限；它與支出列及衝突標記分開保存，捨棄、移回草稿、C 結案不會刪除。C 與佇列收到 POST／查詢的 429 時先保存期限，後續暫停只能延長等待；佇列同步與 C 新增／查詢／重試／恢復共用帳號期限，C 的有效等待取列內 `next_at` 與帳號期限的較大值；非佇列 C 亦保存 429，期間同帳號／環境所有旅行皆暫停。帳號期限與列內等待在同一交易寫入，過期期限不阻擋新請求。版本 4 升級保守保留衝突／限速紀錄的既有 `next_at` 作為限速期限，避免舊衝突遮住 429；409 在查原 receipt 前先記錄，後續查詢拒絕不清除衝突。409 無 receipt 及同旅行 C pending 阻擋交接時持久化等待，只暫停該旅行，其他旅行繼續；等待跨重啟生效。已查回的衝突保留提示供核對。契約見 [D3](../../docs/BACKEND_CONTRACT.md#d3-離線確認與分攤契約)。

`expenseDrafts.ts` 定義只包含原始表單的本機 schema；它允許未完成金額／日期，不包含 HTTP 預覽、分攤結果或憑證。草稿表按環境／帳號／旅行隔離，每個範圍保留一份，UUID／修訂號防止亂序覆寫，捨棄與成功的 tombstone 防止晚到寫入復活。

草稿交給 C 的 pending 建立與來源狀態改變在同一 SQLite 交易；結案也以交易清理，明確拒絕才恢復原始輸入。所有共用連線操作序列執行，不把 C 的查詢混入交接交易。真 SQLite 測試涵蓋舊表升級、檔案重開、修訂／捨棄競態、寫入與清理失敗，以及子程序在交接交易前後直接結束；測試不代替 iOS／Android 裝置驗收。

`draftTrips.ts` 定義版本 3 的最小旅行快照：按環境／帳號／旅行保存名稱、成員／分類選項與更新時間。拒絕標記清空快照私人內容但保留 D1 原始輸入；旅行名稱讀取不能解除拒絕，只有新選項成功保存才可恢復。共用同一 SQLite 連線與序列；Web adapter 仍不載入 SQLite。本機身分、草稿與快照的操作邊界見 [架構](../../docs/ARCHITECTURE.md#受限離線入口d2)。

`mutations.ts` 在版本 7 新增 E1 `pending_mutation`，使用同一連線／交易升級與帳號限速，但與 `expense_queue` 分表。只保存明確確認的旅行建立／加入 body 與固定 UUID；不存未確認表單。所有讀寫隔離環境／帳號，未結案不可改或刪；終局結果清除 payload（邀請碼），保留最小提示直到使用者移除。一般拒絕或 not_found 不刪不確定紀錄；409 標記獨立於限速。收到 429 沿用 `expense_rate_limit`，提示移除／結案不清期限，與 C／D 同步鏡像共用。

G2b 沿用 schema 8。expense_draft 的 raw JSON 可加 currency／rateText／rateSource／rateDate；缺欄位按旧 TWD／1 使用，不补写旧原始字串或 frozen pending。pending_expense 用扩充后的 strict create schema 读原币／完整 rate；UUID 与 body 不因旅行设定、参考值或重启更换。外币 raw draft 不能写入 D TWD queue，prepare 与同步也独立检验此界线。

B3 使用 schema 9，C／E envelope 保存 API 版與帳本單位，舊 frozen JSON 不重寫；草稿／快照與恢復規則集中見 [B3 架構](../../docs/ARCHITECTURE.md#b3mobile-帳本與舊資料恢復)。B5c-2 使用 schema 10，`expense_queue.api_version` 保存入列版本（舊列 v1、新列 v2），prepare 依此交 C。B5d-1 起 C／E insert 與 D prepare 只接受 v2，舊 v1 列照常解碼；`remove(…, 'abandoned')` 與 mutation `abandon` 只供使用者捨棄退役紀錄。

`preferences.ts` 另開 `travel-budget-preferences.db`，單列 `device_preferences` 只存 version 1 的 language／appearance，與帳務 schema 10、限速、帳號 scope 及 SecureStore 分離。單一 UPSERT 原子替換，序列化由根層 PreferenceStore 負責；登出不清除。損壞或較新格式不得靜默覆寫，使用者可明確重設這兩項設定。`preferences.web.ts` 以 localStorage 保存非敏感偏好，不引入 SQLite wasm。Expo Go／development build／不同 App 容器不承諾互相搬移；卸載或清除 App 資料可能移除偏好。
