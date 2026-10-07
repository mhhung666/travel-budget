# 後端分工與 API 契約

手機沿用同一 repository 中 `apps/web` 的後端與資料庫。唯讀切片（登入、旅行、支出清單／明細、結算）與線上新增支出的後端端點（成員資料、均分預覽、冪等新增、結果查詢）已實作，手機的新增畫面與待確認紀錄已使用這些端點；尚未代表任何遠端環境已部署。

## 已實作端點

基底路徑 `/api/v1`。手機與後端透過 `@travel-budget/contracts` 共用 schema，單一來源為 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)，OpenAPI 產物為 [packages/contracts/openapi.json](../../../packages/contracts/openapi.json)。從 repository 根目錄執行 `pnpm contracts:generate` 更新產物，`pnpm contracts:check` 檢查同步。手機沒有 Web source 或 DB 相依。

| 端點                                     | 輸入／回應                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /auth/login`                       | JSON `{ username, password }` → `{ accessToken, refreshToken, expiresIn, user }`  |
| `POST /auth/refresh`                     | JSON `{ refreshToken }` → 新 token pair 與目前 user                               |
| `POST /auth/logout`                      | JSON `{ refreshToken }` → `{ loggedOut: true }`；無須有效 access token            |
| `GET /me`                                | Bearer access token → `{ id, username, displayName }`                             |
| `GET /trips?page=1&date=YYYY-MM-DD`      | Bearer → `{ items, nextPage }`；每頁 20 筆                                        |
| `GET /trips/:id/landing?date=YYYY-MM-DD` | Bearer；僅 ObjectId → 受限成員摘要                                                |
| `GET /trips/:id/expenses?cursor=…`       | Bearer → `{ items, nextCursor }`；每頁 20 筆，游標無效回 400                      |
| `GET /trips/:id/expenses/:expenseId`     | Bearer → 單筆明細：原幣／TWD 金額、匯率與各成員 TWD 分攤                          |
| `GET /trips/:id/settlement`              | Bearer → 餘額、建議轉帳（尚未付款）、既有還款、總額與三種狀態                     |
| `GET /trips/:id/expense-options`         | Bearer → `{ members: [{ id, displayName }], categories }`；成員順序即均分尾差順序 |
| `POST /trips/:id/expenses/preview`       | JSON `{ amount, member_ids }` → `{ amount, splits }`；唯讀的均分預覽              |
| `POST /trips/:id/expenses`               | JSON（見下）→ 與明細相同的支出；`client_request_id` 冪等，重播得到相同結果        |
| `GET /trips/:id/expense-requests/:uuid`  | Bearer → `{ status: 'committed', expense }` 或 `{ status: 'not_found' }`          |

成功 envelope 是 `{ data }`；失敗是 `{ error: { code }, requestId }`。所有回應 `Cache-Control: no-store`，429 帶 `Retry-After`。僅接受 JSON body，大小上限 8 KiB。沒有跨來源瀏覽器 CORS；原生請求不使用 Web cookie。

Trip DTO 包含 `id/name/description/startDate/endDate/destination/archived/memberCount/mySpent/myBalance/phase`。Landing 加入 `role/expenseCount/todayGroupSpent/budgetTotal`。日期為 date-only，金額為 TWD、保留既有到分規則；`myBalance` 正數是應收，負數是應付。沒有成員私人預算陣列、分享碼、檔案 key 或收據。

支出清單按 `date`、`createdAt`、`_id` 降冪，游標編碼最後一筆的三個值，因此同日同時間的資料不會跨頁漏掉或重複；分頁不是快照，資料變更後從第一頁重讀。清單與明細 DTO 為明確白名單：id、日期、說明、分類（未知值歸為 `other`）、付款人、TWD 金額、原幣金額與幣別；明細另有匯率與各成員分攤。不輸出附件、標籤、行程關聯、登入帳號或分享碼。付款人或分攤成員的參照已不存在時，id 為 `null`、名稱為空字串。

結算沿用 `readSettlement` 的餘額與最少轉帳計算（已先扣除已登記還款），`suggestedTransfers` 帶成員 id 以辨識同名成員，全部尚未付款；`status` 為 `empty`（無支出也無還款）、`settled` 或 `outstanding`（任何餘額未歸零即為此狀態）。結算仍讀取該旅行全部支出與還款，游標分頁不代表結算查詢有最佳化。

上述旅行端點只接受成員 ObjectId：非成員、失去資格、分享碼、格式錯誤、不存在或屬於其他旅行的支出一律 404，不 fallback 到 public API。

### 線上新增支出的契約

本輪只支援 TWD、匯率 1 與勾選成員均分。新增 body（snake_case，沿用 Web 輸入名稱；回應仍是 camelCase DTO）：`client_request_id`（UUID，必填）、`payer_id`、`original_amount`、`currency: 'TWD'`、`exchange_rate: 1`、`description`（trim 後 1–200 字）、`category`、`date`（YYYY-MM-DD，須是真實日期）、`splits: [{ user_id, share_amount }]`（1–100 位、不可重複、可為 0、至多兩位小數）。金額為正值、至多兩位小數，且金額與每份分攤不超過單筆上限 1,000,000,000.00（超過回 400、不寫入，預覽同樣）；附件、標籤、行程關聯等其他欄位一律 400，不被忽略。付款人可不參與分攤。

預覽 `{ amount, member_ids }` 由後端呼叫 Web 表單使用的 `computeSplits('equal')`，結果一律依 `expense-options` 的成員順序（與請求順序無關）：100 元三人為 33.34／33.33／33.33。預覽不寫入、不保留交易，新增時後端仍重新驗證成員、加總與金額，所以預覽不代表日後一定能寫入。App 應原樣送出預覽的分攤，不自行計算。

**狀態碼語意**：200 已入帳（含重播）；**任何 4xx 都代表此請求沒有寫入**——400 輸入或成員／金額驗證錯誤、401 session 失效、404 無權或不存在、409 `IDEMPOTENCY_CONFLICT`（同 key 不同內容，須查明原請求，不可換 UUID）、413 body 超過 8 KiB、415；429 `BUSY` 是交易因競爭而中止、尚未提交，依 `Retry-After` 以同一個 key 重試。**5xx、逾時與斷線代表結果不確定**：以 `expense-requests` 查詢，或以同 key、同內容重試；`not_found` 只代表目前沒有 receipt，不代表請求不在執行中。`requestId` 只是診斷編號，不能取代 `client_request_id`。

每次使用者確認的提交產生一個 UUID（建議小寫，後端比對不分大小寫），之後的重送、401 refresh 重送與結果查詢都沿用它與凍結的內容。重播前後端重新授權：失去成員資格者不能重播或查詢；receipt 與支出同一交易提交，支出之後被刪除仍視為已提交，不會重新建立。

手機端依上述語意處理（`features/expenses/entry.ts`）：refresh 的錯誤另標記來源，一律保留待確認紀錄，不套用以下支出端點的拒絕規則；只有 200 或查詢得到 `committed` 才算已儲存；來自 API 本身（含 `{ error: { code } }`）的 400／413／415 等寫入前拒絕才清除待確認紀錄；401／403／404／429、409 與所有逾時、斷線、5xx、無法解析的回應（含閘道的 4xx 網頁）都保留紀錄，因為先前的嘗試可能已經提交。409 先查明原請求而不換 UUID；429 依 `Retry-After` 以原 UUID 重試，期間不重送。手機另以 `requestAs` 確保請求只用建立該請求的帳號的 token 送出；登入已更換後才到的回應（資料或錯誤，包括 400）一律視為結果不明，紀錄保留。

旅行列表沿用 Web 共用服務先讀取本人全部旅程與摘要，再排序、分頁；HTTP payload 有界，DB 工作量仍隨本人旅程數增加。分頁不是快照，Web 有變更後應從第一頁重新整理。`date` 由手機以本地日曆日提供，未提供時使用伺服器 UTC 日。

## 認證與失敗語意

- 沿用既有「帳號／密碼」，不是 Email 登入。Web 與手機共用 credentials check，但建立不同 session。
- access JWT 有效 15 分鐘，refresh／裝置 session 絕對有效期 30 天。手機 signing key 從既有後端密鑰做 domain separation，並驗證 issuer／audience；手機 JWT 不能當 Web cookie 使用。
- MongoDB 只保存 refresh token 雜湊及密碼雜湊的 keyed fingerprint。每次授權檢查 session 撤銷／到期、帳號與目前密碼；網站變更／重設密碼後手機憑證立即失效。
- refresh 以原子 compare-and-swap 單次輪替；已消耗但簽章有效的 refresh 重放會撤銷整個裝置 session。手機合併併發 refresh，禁止自動重試 refresh POST。若伺服器已輪替但回應遺失，下一次可能需要重新登入；不承諾跨當機的輪替恢復。
- 收到輪替結果但 SecureStore 寫入失敗時，手機停止使用舊 session、清除私人快取與舊憑證，並嘗試撤銷新憑證。清除成功後回到登入頁；若安全儲存仍無法清除，顯示儲存錯誤與重試，不假稱已完成本機清除。
- 登入按正規化帳號與 15 分鐘時段限制每段 10 次嘗試；429 的等待期間手機會尊重 `Retry-After`。
- 401 最多更新並重送一次；更新或重送再次 401 清除登入與私人快取。403／404 不走 public API。網路／逾時／5xx 由使用者明確重試。
- 重開 App 離線時保留 SecureStore；已有與憑證原子保存的本機帳號身分時，斷線／逾時可進入只存草稿的受限模式，不代表 session 已驗證。本機 user 不符合目前 schema 時視為沒有本機身分，有效 token 仍可線上刷新；外層格式、token 或 SecureStore 讀取失敗仍回報儲存錯誤。沒有本機身分、儲存失敗或伺服器錯誤時仍顯示恢復登入失敗與重試。登出需要連線完成撤銷；失敗保留登入，避免假稱成功。
- 後端新增 `20261002100000-mobile-session-expiry.js` TTL migration；未執行時有效期檢查仍生效，但過期紀錄不保證自動清理。此實作未執行任何遠端 migration。

## D3 離線確認與分攤契約

離線確認的是 **TWD 總額、原始欄位、付款人、指定分攤成員及均分規則**，不是各人金額。畫面明示後端決定各人份額／尾差，確認後允許前景自動送出；只存草稿不授權同步。每次確認保存一個 UUID、原始輸入及當時完整成員 ID 順序；快照不代表目前仍有授權。此契約只在手機裝置端表示意圖，沒有新增 HTTP body 或端點。

同步先用原帳號重新讀 `expense-options`，完整名單／順序或原始選項失效時轉「需重新確認」，不悄悄移除／新增成員、修改付款人或改總額；唯讀預覽前後發生新的已知撤權也停止。只在名單與順序一致時，以既有 `expenses/preview` 產生均分，原樣組成既有 `expenseCreateInput`。在同一 SQLite 交易建立 C pending 的 UUID／凍結內容並標記佇列 `prepared`，成功後再檢查撤權世代才可 POST；交接期間發生撤權則保留凍結紀錄並停止送出。手機沒有分帳算法。準備後不再取得不同分攤，也不能修改／捨棄；即使交易後、POST 前當機，也先查 receipt，再以原 UUID／payload 重試。

佇列按環境／帳號隔離，`queued` 可移回草稿修改／捨棄；`attention` 保留原輸入但必須重新確認；`prepared` 連同 C 的 `sending`／`unconfirmed` 表示已凍結、送出中或結果不明；200／committed 原子移除 pending 與佇列，確定拒絕則原子移除 pending 並保留 `attention`。同 UUID 查回不同內容時保留 `resolved` 衝突提示，僅可移除提示，不能重新送出。移回草稿不覆蓋現有草稿；使用者另外明確確認捨棄現有草稿才可替換，待確認／已交接的支出仍禁止替換。

App 啟動、回前景、恢復連線及前景每 30 秒同步；有效線上登入、連線與前景狀態每一步都重檢。撤權世代檢查經 C 傳至 HTTP transport，每次 fetch 前同步執行，涵蓋序列等待、SQLite 讀取／保存及憑證刷新後重送；已凍結的 UUID／內容保留，不因本機阻擋而清除。多筆依保存順序序列處理，未解決的暫時性故障／冷卻擋住後續送出；需人工處理的未送出項目可跳過。409 尚查不到 receipt 與等待同旅行 C 結案屬旅行內阻塞，保存至少 30 秒等待並跳過該旅行的後續項目，其他旅行繼續；重啟後亦適用。原 C 非佇列紀錄仍只自動查詢、不自動重送；同旅行有 C pending 時不交接下一筆，C 結案且等待期限到後恢復交接。C 的 POST、手動／自動查詢及失敗後查詢收到 429，皆在回報前保存最早重試時間；後續錯誤不縮短既有期限，重啟與 C 手動查詢／重試仍尊重 Retry-After。429 期限獨立於可刪除的支出列，按帳號／環境保存，C 新增／恢復／手動查詢／重試與佇列同步共用；捨棄、移回草稿及 receipt 結案皆不縮短等待。衝突標記與 429 限速期限分開保存／判斷，限速到期前同帳號／環境的所有旅行皆暫停，無論衝突項目在佇列中的順序；到期後無 receipt 的衝突仍只阻擋該旅行。409 在查詢 receipt 前保存衝突，查詢的 401／403／404／429 不解除衝突，未查明前不自動重送；其他不確定故障至少等待 30 秒。refresh 失敗不清資料，登入失效停止同步，重新登入原帳號後可繼續；撤權保留紀錄並提示。已開始的 HTTP 可以完成，但背景／斷線／換帳號後不啟動下一步。OS 背景排程未實作。

## E1 旅行入口與操作 receipt

已實作 `POST /trips`（UUID、name、description、可空 start_date／end_date → `{ tripId }`）、`POST /trips/join`（UUID、invite_code → `{ tripId, alreadyMember }`）、`GET /trips/:id/invitation`（成員 → `{ code, url }`）與 `GET /mutation-requests/:uuid`（原帳號 → `not_found`／`committed`／`rejected`）。輸入嚴格，UUID 正規化小寫；邀請碼 trim／小寫 6–10 碼英數，ObjectId 不可加入。日期／名稱上限與 Web 共用。建立者 admin；有效碼已加入者成功但不新增成員／副作用。邀請 URL 使用後端 `APP_URL` 的 origin，無配置則回 5xx；手機獨立 Web host 時設定 `EXPO_PUBLIC_WEB_ORIGIN`，預設核對 API origin。兩端必須指向同一環境。

Web／Mobile 共用 `lib/tripEntry.ts`，旅行、成員、receipt 與新加入的站內通知／動態在 MongoDB snapshot／majority 交易提交；邀請碼用安全亂數，唯一索引碰撞有限重試。Receipt `_id` 為操作者＋小寫 UUID，指紋含種類與標準化 body，不設 TTL、不隨旅行刪除。Web 保留 ObjectId 加入 adapter；手機只用有效碼。重播／結果查詢先重新核對成員及刪除狀態，加入後撤權不自動再加入；不同內容／操作 UUID 回 409。無效邀請保存 `INVITATION_INVALID` 終局拒絕，後來碼變有效也不重新執行原操作。Email／push 在提交後 best-effort，重播不再次排程；外部失敗不改報加入失敗。

手機 schema 7 的獨立操作表保留 C／D 舊資料與限速；保存失敗不送出。確認後凍結 body／UUID，所有不確定、401／404／refresh 失敗及 409 保留，409 標記不可被後續查詢拒絕覆蓋。僅 200／committed 或終局 rejected 結案並清除敏感 payload；一般 400 只證明本次嘗試，不能推論先前未提交。`not_found` 不表示原請求未執行，也不可換 UUID。啟動、回前景、重連只自動查詢，POST 原內容重試須明確操作，且先查原 receipt。每個帳號／環境同種類未結案操作擋住新確認，重複點擊亦在引擎與 SQLite 防重；E1 尚無 tripId 時不冒用帳務旅行鎖。

E 的寫入／查詢與 C／D 共用 `expense_rate_limit`。429 先落盤絕對期限，SQLite／序列等待與 refresh 後每次 fetch 前同步檢查，登入世代變更也停止；本機攔截不延長期限。完成、移除提示不刪等待。加入成功只以最小 tripId 導向，再由既有授權讀取建立快照。

後端新 migration `20261006100000-mutation-requests.js` 可在隔離環境重跑，使用 MongoDB `_id` 唯一約束及既有邀請碼唯一索引；需部署相容後端／索引後才發 App。未執行遠端 migration；兩平台本機操作已驗，範圍與限制見 [本機驗收](LOCAL_ACCEPTANCE.md)。

## E2 註冊與 Email 驗證碼重設

| 匿名端點                            | 輸入                                            | 成功                                    |
| ----------------------------------- | ----------------------------------------------- | --------------------------------------- |
| `POST /auth/register`               | `username`、`display_name`、`email`、`password` | 最小 user DTO；不附憑證／cookie         |
| `POST /auth/password-reset/request` | `email`、選填 `locale`                          | `{ accepted: true }`（所有 Email 相同） |
| `POST /auth/password-reset/confirm` | `email`、六位字串 `code`、`new_password`        | `{ reset: true }`                       |

帳號 trim 後 3–200 字，顯示名稱 1–100 字；Email trim／小寫並驗格式，最多 254 字。新密碼至少六字元、最多 72 UTF-8 bytes，空白保留；舊登入輸入不改。確認密碼不送 API，未知欄位拒絕。409 `ACCOUNT_CONFLICT` 不區分帳號／Email。400 `INVALID_CODE`、`CODE_EXPIRED`、`TOO_MANY_ATTEMPTS` 可重新寄碼；429 `RATE_LIMITED` 附 Retry-After。逾時、5xx 或無法驗證成功回應均結果不明：建立／重設可先登入核對，不能自動重送，也不保存密碼。

`accountEntry.ts` 共用 Web／HTTP 規則；六位碼 15 分鐘有效，五次錯碼上限；錯誤嘗試、密碼更新／碼消耗與重新寄碼的競態在 MongoDB 交易內處理。同碼併發只成功一次；未到期且錯碼未滿五次時，重寄回 429 並保留原碼、次數與期限；已鎖死的碼可在上次寄碼 60 秒後更換，仍受每小時五次上限，新碼與尚存舊碼不同，副作用在提交後 best-effort；不印碼到本機／正式 log。現有 Mobile 密碼 fingerprint 檢查使舊 session 失效；Web cookie 機制不宣稱全撤銷。本機 C／D／E1 紀錄不刪。

匿名限流為原子滑動時窗：每正規化 Email 寄碼預設每 15 分鐘一次、每小時五次；錯碼滿五次的恢復例外只把間隔縮為 60 秒，不清除寄碼或驗碼配額。`accountentryattempts` 以相同 HMAC key 保存已知／未知 Email 的錯碼次數與有效期限，與錯碼／寄碼交易一起提交，使例外的回應與等待一致；寄碼配額與新碼同交易，被拒絕不消耗配額或延長期限，寄信失敗亦須等原期限再寄；驗碼每 15 分鐘十次（未知 Email 同樣計數）；註冊另按帳號每小時二十次。零冷卻操作只限制時窗次數，請求逆序到達不另加時間間隔，亦不縮短原到期時間。可信來源的註冊／寄碼共用每小時二十次，只在 `VERCEL=1` 接受平台覆寫的單一 `x-forwarded-for` IP；其他環境忽略用戶轉送 header，仍保留 Email／帳號限制，需部署入口另做流量限制。政策集中 `accountPolicy`，adapter 不各自定義。計數 `_id` 用 JWT secret 的 domain-separated HMAC，不記明文 Email／IP，TTL 不取代期限判斷；與已登入帳務限流分開。

手機按註冊、寄碼、驗碼分開保存記憶體中的等待期限；首次寄碼與重新寄碼共用寄碼期限。按鈕與送出守衛只套用該操作期限，寄碼受限仍可提交已有的有效碼，驗碼受限仍可明確重新寄碼；寄碼成功不解除驗碼等待。驗碼明確回 400 `TOO_MANY_ATTEMPTS` 時，解除舊的寄碼 UI／HTTP client 等待，僅允許使用者手動重試，由後端重查 60 秒及來源／小時配額；其他錯誤不解除。本機攔截不延長原期限，後端及 HTTP client 各自的限流仍保留。

migration `20261006120000-account-entry-limits.js` 建立匿名計數 TTL 並確保既有 reset-code unique／TTL 索引。驗證使用隔離 replica set、mock 寄信 adapter 與隔離 HTTP 資料庫，不寄正式信件；後端先部署相容服務／索引，App 後行。本次未執行遠端 migration。

尚未解決：**Email 寄碼／驗碼額度可被他人耗盡，導致一小時內無法重設**。寄碼上限為每小時五次，驗碼為每 15 分鐘十次；目前驗碼入口沒有來源限流（Vercel 的來源限制僅套用註冊／寄碼）。本次僅恢復鎖死碼的重寄路徑，沒有消除此定向阻斷風險，也不列為已驗收或已接受。後續須設計可信來源／挑戰驗證與額度隔離，其他部署亦須有入口流量防護。

後續簡化評估：目前為維持回應一致，未註冊 Email 也保存錯碼次數與到期時間，增加了狀態與交易邏輯。加入依來源限制後，重新評估能否回到較單純的流程、移除這份額外狀態；仍需驗證帳號存在性不外洩、有效碼不被任意更換，以及鎖死碼可恢復，不能直接刪除保護。

## E3 支出維護

已實作 `GET /trips/:id/expenses/:expenseId/edit-context`、同資源 `PATCH`／`DELETE`。admin／member 都可操作；僅成員 Bearer，嚴格 JSON／8 KiB／no-store，輸入 snake_case。context 在 trip fence 的一致交易內取得明細、最新 options、raw category、HMAC revision 與 equal 能力／限制原因，不輸出附件、標籤或行程內容。單筆已不存在回 `404 RESOURCE_GONE`，旅行未授權回 `404 NOT_FOUND`；手機不把單筆消失當作整個旅行撤權。

PATCH 帶 `client_request_id`、`expected_revision`、`mode`、非空 `changes`。`basic` 只接受實際修改的說明、分類、日期，未送欄位原樣保留，未知歷史分類不被 DTO 的 `other` 寫回。`equal` 必須明確選擇並帶完整 original_amount／payer_id／splits；只限後端判定可安全映射的原 TWD／匯率 1 帳務。確認前重讀 context，預覽後再查版本，金額 0.01–1,000,000,000.00、最多 100 位，後端以既有 equal 計算再次核對每份尾差。附件、標籤、行程關聯與建立資料均不清除。成功最小結果為 `{ tripId, expenseId, revision }`。

DELETE 的 JSON body 為 UUID／expected_revision，成功 `{ tripId, expenseId, deleted: true }`。同交易移除 expense／comments、安排既有 blob retirement、寫一次活動及 receipt；提交後檔案清理失敗仍是成功，建立 receipt 不刪。`409 RESOURCE_CHANGED`／`RESOURCE_GONE`／`VALIDATION_ERROR` 均保存終局 rejected receipt；相同 UUID 重播先授權及查 receipt，再檢查新前條件，同 key 不同內容回 `IDEMPOTENCY_CONFLICT`。`mutation-requests` 延續原帳號查詢，E3 結果含獨立 tripId 與 expenseId，終局拒絕也重新核對旅行資格。

revision 對原始業務欄位、支出／旅行 ID 與目前成員的儲存／有效順序作穩定 HMAC，簽章域與登入分開；外幣、分攤、附件、標籤、行程解除或虛擬身分轉換都使舊確認失效，背景 outbox 不影響。內容還原可回到相同 token，這是狀態前條件。Web advanced 編輯與 Mobile 維護都位於共用 `expenseMaintenance.ts`；Web 仍保留既有進階欄位／附件驗證與 cookie 行為。

手機 SQLite schema 8 加上 E 的 trip_id／索引，保留 C／D／E1 與帳號等待。C 新增、D 交接及 E 確認在同一 SQLite 序列／交易檢查同旅行 pending；原 UUID 查詢／重試不被自己的鎖阻擋，D queued 可保留，其他旅行可繼續。未確認編輯只留畫面且與 D 草稿分離；確認後先落盤再 PATCH／DELETE，重啟／前景／重連只查 receipt，不自動重送。終局成功清 payload；E3 拒絕保留本人輸入供明確重開、讀新 context／預覽及新確認，未確定不能修改／捨棄。C／D／E 共用持久化 429 絕對期限與 fetch 前登入／撤權守衛。

成功後重讀第一頁、明細、結算、landing 與列表摘要；刪除明細快取並避開其預期 404。重讀失敗保留成功，僅提供只讀重試；不樂觀調整餘額。兩平台本機操作與故障矩陣已驗，範圍與限制見 [本機驗收](LOCAL_ACCEPTANCE.md)；未部署／未執行遠端 migration。

## E4 登記與撤銷還款

已實作以下成員 Bearer 端點，沿用嚴格 JSON、8 KiB、no-store、snake_case 輸入與 camelCase 回應；schema／OpenAPI 的唯一來源仍是共用 contracts。

| 路徑                                                | 輸入／結果                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /trips/:id/payment-context`                    | `{ members: [{ id, displayName }], settlement, settlementRevision }`                      |
| `POST /trips/:id/payments`                          | UUID、expected_revision、from_id、to_id、amount、note → `{ tripId, paymentId, revision }` |
| `GET /trips/:id/payments/:paymentId/revoke-context` | `{ payment, revision }`，僅方向、金額、備註、日期等白名單                                 |
| `DELETE /trips/:id/payments/:paymentId`             | JSON UUID、expected_revision → `{ tripId, paymentId, deleted: true }`                     |

任何目前成員都可代記／撤銷，包括虛擬成員。付款／收款必須是不同的有效成員 ID；TWD 金額 0.01–1,000,000,000.00，最多兩位小數；備註 trim 後最多 200 字。部分、超額、沒有建議的手動付款均可，建議不作上限。只記錄外部已完成的實際付款，不執行轉帳；撤銷是修正誤登而非退款。成功只表示登記／撤銷完成，不表示餘額歸零；結算由後端重算。

`paymentWrite.ts` 為 Web cookie action 與 Mobile HTTP 共用的 actor／交易服務，`calculateSettlementDetail` 抽出既有結算計算供模型讀取與交易快照使用。context 在同一 trip fence／snapshot 內讀成員、支出及還款；HMAC token 綁定 trip ID、成員儲存／有效順序、原始支出業務欄位與 payment ID／方向／金額／備註。背景送達狀態及顯示名稱不影響 token；Web 支出或還款修改、D 新增及身分轉換會使舊確認失效。不是持續遞增版本，內容還原可回相同 token。

Mobile 登記在寫入交易內重算／比較 `expected_revision`；不一致保存終局 `409 SETTLEMENT_CHANGED`。相同 UUID／內容先重新授權及查 receipt，再檢查新前條件；不同內容回 `IDEMPOTENCY_CONFLICT`。兩個不同 UUID 依同一舊狀態登記，只有第一筆可提交；新狀態經再次明確確認後可以同額登記，不按金額猜測重複。撤銷比較原始 payment ID／方向／金額／備註 HMAC，變動回 `409 RESOURCE_CHANGED`，已消失回 `409 RESOURCE_GONE`；context 的單筆消失是 `404 RESOURCE_GONE`，非旅行撤權。

payment、receipt、一次 `payment_recorded` 活動與通知在同一交易提交。只通知付款／收款雙方中非操作者、非虛擬成員；提交後 Email／push 失敗仍是成功，重播不再寄送。撤銷沿用 Web 不新增通知／動態的語意；建立 receipt 永久保留，撤銷後 create 重播仍回原成功，不能恢復 payment。receipt 查詢只回最小結果，不輸出服務內保存的 Web 顯示快照。既有 Web 表單 adapter 取得當前 context 後呼叫同一服務；新金額精度與上限驗證同步適用 Web。

Mobile 未確認輸入僅保留當次畫面並有離開提醒；開表單及確認前讀最新 context，衝突保留金額／方向／備註，核對最新後再明確確認，不能自動換建議額送出。確認後沿用 schema 8 的獨立 E 操作表，先保存 UUID／body 再 HTTP；回應不明、重啟、回前景／重連只查原 receipt，不自動重送。終局拒絕保留原輸入供重開，新確認才用新 UUID；未確定不能改／捨棄。C／D／E3／E4 同旅行 pending 原子互擋，其他旅行仍可操作，共用帳號／環境 429 絕對期限及最後 fetch 前登入／撤權守衛。成功刷新結算、列表與 landing，讀取失敗保留成功且只讀重試，不在 App 算餘額。

沿用 E1 receipt 唯一索引、既有 payments 索引及 SQLite schema 8，不新增 migration／原生依賴。開發測試／三平台匯出不等於裝置驗收；獨立審查及兩平台基本操作見 [E4 交接](LOCAL_ACCEPTANCE.md#e4-還款驗收交接)，未部署／未執行遠端 migration。

## 尚未實作

外幣與非均分金額編輯、附件 begin／finish、推播、帳號刪除及 OS 背景同步均屬後續工作（見 [路線](ROADMAP.md)）。D1 原始草稿、D2 受限入口與 D3 離線確認／多筆前景待送佇列沿用既有 HTTP 端點；AI 仍只產生草稿，正式寫入需使用者確認。實作與開發測試不代表已部署或兩平台裝置驗收通過。
