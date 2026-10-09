# 後端分工與 API 契約

B3 Mobile 已使用 B1 v2 契約。線上回應必須帶合法 ledger；基準單位、v1 安全阻擋及原 UUID 恢復規則見 [B1 API](../../web/docs/MOBILE_API.md#b1-基準幣別契約)，Mobile 持久化與傳輸見 [B3 架構](ARCHITECTURE.md#b3mobile-帳本與舊資料恢復)。下方 v1／TWD 節保留歷史相容契約，舊已確認操作及 D TWD 均分佇列繼續使用它。

**B1 後端已實作**：[B0–B4 規格](ROADMAP.md#b旅程基準幣別改造規格2026-10-08) 的模型、共用服務與 v2／v1 保護已交付，實際契約見 [Web API 的 B1 說明](../../web/docs/MOBILE_API.md#b1-基準幣別契約)。非 TWD 建立預設關閉；B2 Web／B3 Mobile 已實作，B4 獨立跨端核對待完成。下列 v1／TWD 流程只供舊操作恢復，不能把新單位套入舊 pending。

手機沿用同一 repository 中 `apps/web` 的後端與資料庫。唯讀切片（登入、旅行、支出清單／明細、結算）與線上新增支出的後端端點（成員資料、均分預覽、冪等新增、結果查詢）已實作，手機的新增畫面與待確認紀錄已使用這些端點；尚未代表任何遠端環境已部署。

## 已實作端點

基底路徑 `/api/v2`（`/api/v1` 已於 B5d-2 刪除；App 設定只填網域，舊的 `/api/v1`／`/api/v2` 結尾仍接受並對應同一個環境身分，送出時一律用 v2）。手機與後端透過 `@travel-budget/contracts` 共用 schema，單一來源為 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)，OpenAPI 產物為 [packages/contracts/openapi.json](../../../packages/contracts/openapi.json)。從 repository 根目錄執行 `pnpm contracts:generate` 更新產物，`pnpm contracts:check` 檢查同步。手機沒有 Web source 或 DB 相依。

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

支出清單按 `date`、`createdAt`、`_id` 降冪，游標編碼最後一筆的三個值，因此同日同時間的資料不會跨頁漏掉或重複；分頁不是快照，資料變更後從第一頁重讀。清單與明細 DTO 為明確白名單：id、日期、說明、分類（未知值歸為 `other`）、付款人、TWD 金額、原幣金額與幣別；明細另有匯率與各成員分攤。不輸出附件、標籤、行程關聯、登入帳號或分享碼。付款人或分攤成員的參照已不存在時，id 為 `null`、名稱為空字串。授權清單／明細另提供可選 `payerIsVirtual`，明細分攤可選 `isVirtual`，只來自目前解析的使用者欄位；舊 API／歷史 receipt 缺旗標仍有效，缺值不可推定為正式或虛擬成員。此資訊不代表目前旅行成員資格。

結算沿用 `readSettlement` 的餘額與最少轉帳計算（已先扣除已登記還款），`suggestedTransfers` 帶成員 id 以辨識同名成員，全部尚未付款；`status` 為 `empty`（無支出也無還款）、`settled` 或 `outstanding`（任何餘額未歸零即為此狀態）。結算仍讀取該旅行全部支出與還款，游標分頁不代表結算查詢有最佳化。

上述旅行端點只接受成員 ObjectId：非成員、失去資格、分享碼、格式錯誤、不存在或屬於其他旅行的支出一律 404，不 fallback 到 public API。

### 線上新增支出的契約

線上新增支援 TWD／外幣與勾選成員均分，匯率／原額細節见 [G2b](#g2b-原幣預覽與新增)。新增 body（snake_case，沿用 Web 輸入名稱；回應仍是 camelCase DTO）：`client_request_id`（UUID，必填）、`payer_id`、`original_amount`、`currency`（支援 ISO）、`exchange_rate`（TWD 固定 1）、`description`（trim 後 1–200 字）、`category`、`date`（YYYY-MM-DD，須是真實日期）、`splits: [{ user_id, share_amount }]`（1–100 位、不可重複、可為 0、至多兩位小數）。金額為正值、至多兩位小數，且TWD／換算後金額與每份分攤不超過單筆上限 1,000,000,000.00（超過回 400、不寫入，預覽同樣）；附件、標籤、行程關聯等其他欄位一律 400，不被忽略。付款人可不參與分攤。

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

PATCH 帶 `client_request_id`、`expected_revision`、`mode`、非空 `changes`。`basic` 只接受實際修改的說明、分類、日期，未送欄位原樣保留，未知歷史分類不被 DTO 的 `other` 寫回。`equal` 必須明確選擇並帶完整 original_amount／payer_id／splits；舊形狀只限後端判定可重算的 TWD／匯率 1 帳務；外幣成對欄位與 capability 擴充見 [G2c](#g2c-原幣均分編輯)。確認前重讀 context，預覽後再查版本，金額 0.01–1,000,000,000.00、最多 100 位，後端以既有 equal 計算再次核對每份尾差。附件、標籤、行程關聯與建立資料均不清除。成功最小結果為 `{ tripId, expenseId, revision }`。

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

## G1a 旅行資料與個人封存

新增成員 `GET /trips/:id/settings`、管理員 `PATCH /trips/:id`、成員 `POST /trips/:id/archive`。context 只回名稱、說明、date-only 起訖、白名單地點、本人角色／封存、旅行資料 revision 及本人 archiveRevision；不含私人預算、其他成員、邀請碼或幣別設定。PATCH 嚴格 body 為 UUID／expected_revision／非空 changes，只接受實際修改的 name、description、start_date、end_date、destination_location；名稱 1–100、說明最多 2000 字，完整地點為 name／display_name／lat／lon 及選填語系／國家，空日期／目的地用 null 清除，未知欄位拒絕。archive 嚴格 body 為 UUID／expected_revision／archived boolean；封存只影響本人，不停用旅行。

`tripManagement.ts` 與 Web update／archive action 共用父旅行 fence／snapshot 交易及日期／自動相片重綁。PATCH revision 以原始資料的 HMAC 比對，不受私人封存、背景 fence 或預算影響；archiveRevision 只綁旅行／操作者／本人封存狀態。部分日期與既有日期在交易內核對；非管理員新編輯保存終局 `FORBIDDEN` receipt，API 回 403，仍是成員者可查拒絕結果且可封存。旅行／成員資格消失為 404 `NOT_FOUND`，重播與結果查詢皆重新授權；只失去管理員角色可重播既有結果。revision 不一致回 409 `RESOURCE_CHANGED`，日期範圍無效回 409 `VALIDATION_ERROR`，均保存終局拒絕。

旅行更新／個人封存與 `mutationrequests` receipt 同交易提交；相同 UUID／內容先重授權及查 receipt，不依最新 revision 重做。不同內容回 `IDEMPOTENCY_CONFLICT`；成功最小結果為 `{ tripId, revision }` 或 `{ tripId, archived }`，通用 mutation 查詢新增 trip.update／trip.archive，原操作向下相容。提交後快取重讀失敗不回報寫入失敗。沿用現有 receipt 索引及 Mobile schema 8 E 操作表，沒有新增 migration。429 及重啟／帳號隔離沿用 C／D／E 保護；未部署、不執行遠端 migration。

## G1b 成員與虛擬成員

新增成員 `GET /trips/:id/members`、管理員 `POST /trips/:id/members`、管理員 `PATCH /trips/:id/members/:memberId`。全名冊白名單只含 ID／displayName／isVirtual／role／joinedAt（舊缺值為 null），依加入時間穩定排序；context 含本人角色及名冊 HMAC revision，不含 username、Email、密碼、預算或邀請碼。寫入嚴格 body 為 UUID、expected_revision、display_name（trim 後 1–200 字），角色／其他未知欄位拒絕；更名只接受目前旅行中仍為虛擬的 ID，不能修改真人。

`memberManagement.ts` 與 Web addVirtualMember action 共用建立服務；父旅行 fence 在同一 snapshot 交易內重新授權、檢查管理員／全名冊 revision，再建立 User＋membership 或更名並保存 receipt。更名的 User 寫入也與其他旅行的認領／轉真人共用 user fence，不能在轉為真人後覆蓋其名稱。更名保留帳務、ID 與其他身分欄位；名稱是共用 User 的現名，影響重新讀取的歷史／其他旅行參照。Web 提交後 cache 刷新失敗不推翻成功。

成功最小結果 `{ tripId, memberId, revision }`；mutation 查詢擴充 member.create／member.rename，resourceId 為 memberId。原 UUID 先重授權並查既有 receipt，不因目前名冊 revision 不同重做；不同內容為 409 IDEMPOTENCY_CONFLICT。新降權為 403 FORBIDDEN、名冊變動為 409 RESOURCE_CHANGED、對象移除或不再虛擬為 409 RESOURCE_GONE，均保存可查終局拒絕；降權但仍是成員可重播／查原結果，退出或旅行消失為 404 NOT_FOUND。429 持久化與原內容恢復沿用 C／D／E；同 schema 8 操作表及 receipt 索引，沒有 migration。

expense-options／payment-context members 新增可選 isVirtual；結算 balances／suggestedTransfers／payments（含撤銷 context）分別新增 isVirtual、fromIsVirtual／toIsVirtual。歷史付款對象仍存在時保留旗標，null 參照仍只顯示已移除。這些欄位只出現在成員 HTTP 白名單；Web／public DTO 及歷史支出建立 receipt 保持原格式。未部署，裝置驗收另交接。

## G1c 權限與危險操作

`GET /trips/:id/access` 回傳全名冊、旅行名稱、本人角色、是否可退出、支出／還款筆數及 `accessRevision`；不回私人預算、登入資料或分享碼。HMAC 包含旅行資料／名冊及待刪／解除連結的文件，背景父旅行 fence 排除；目前採完整讀取，旅行資料量大時讀取成本較高，未宣稱效能量測通過。確認後 `POST /trips/:id/access` 嚴格接收 UUID、expected_revision 及 action：role（member_id／role）、remove（member_id）、leave、delete。角色／移除／刪除需管理員；退出只處理本人，最後真人管理員不可退出。對象 ID 正規化為小寫，不能藉大小寫變更或移除自己。

`tripAccess.ts`、Web 角色服務、`memberRemoval.ts` 及 `tripDeletion.ts` 共用交易內業務；父旅行 fence 序列化授權、角色與帳務寫入，資料與 trip.access receipt 原子提交。移除／退出保留帳務與共享身分，刪除沿用既有子文件 cascade／個人記錄解除連結／tripcleanupjobs，不在交易內呼叫檔案服務。403 FORBIDDEN、409 RESOURCE_CHANGED／RESOURCE_GONE／VALIDATION_ERROR 保存終局拒絕，會員存取消失為 404 NOT_FOUND；429 與相同 UUID 不同內容的 409 沿用既有保護。成功最小結果為 `{ tripId, action, exited }`，resourceId 為 tripId；不含歷史帳務或名冊。

**原結果授權例外僅限成功退出／刪除**：操作者本人帳號命名空間中的原 UUID 可在資格消失後查詢／相同內容重播最小成功結果，其他操作和拒絕 receipt 仍重新授權目前成員。不能由 404 猜測成功，也不能換 UUID 重做。Mobile 只有這類退出意圖可略過 catalog 可見性查 receipt，登入世代、帳號、環境與 429 仍檢查；隱藏後寫入重試仍被守衛擋下。SQLite 在同一交易保存終局結果和 draft_trip denied，記憶體立即隱藏，即使本機保存失敗仍保留原意圖供只讀恢復。不新增 migration。

管理員 `GET /trips/:id/members/:memberId/claim-invitation` 在同一旅行交易重新核對管理員／目前虛擬成員，只回 `{ url }`。URL 沿用 Web 的 `/link-virtual/:shareCode/:virtualUsername`，邀請能力是此端點明確的資料邊界例外；名冊及其他 DTO 不因此暴露 username／分享碼。認領／註冊仍由既有 public Web 路由及 `memberIdentity.ts` 完成、處理登入憑證、現成員拒絕及帳務遷移；Mobile 沒有新認領寫入／憑證持久化。被認領或移除的對象不產生新連結；降權回 403，不把一般成員資格誤當撤銷。

## 尚未實作

非均分金額編輯、附件 begin／finish、推播、帳號刪除及 OS 背景同步均屬後續工作（見 [路線](ROADMAP.md)）。D1 原始草稿、D2 受限入口與 D3 離線確認／多筆前景待送佇列沿用既有 HTTP 端點；AI 仍只產生草稿，正式寫入需使用者確認。實作與開發測試不代表已部署或兩平台裝置驗收通過。

## G2a 旅行幣別與參考匯率

- `GET /trips/:id/currency-settings`：成員專用 `TripCurrencyContext`，只含 tripId、role、設定內容、後端支援的 ISO 幣別清單與獨立 currency revision。沒有分享碼、私人預算、名冊或帳務；支援清單沿用後端 Intl，Mobile 不另維護一份允許清單。
- `POST /trips/:id/currency-settings`：嚴格 `TripCurrencyInput`，含 `client_request_id`、`expected_revision` 與完整 `settings: { default_currency, currencies: [{ code, rate }] }`。rate 為有限正數或 null；最多 30 列。後端依既有 Web 規則同幣別後列覆蓋前列、TWD rate 清為 null、default null 且清單空時整份設定清為 null；預設 TWD 可用 null 表達。Mobile 選單限制預設外幣必須在常用清單內，後端仍接受 Web 既有合法設定形狀。
- `GET /exchange-rates`：Bearer 認證，`ReferenceRates` 的 rates、dates、provider 使用既有 Frankfurter 後端代理，方向 `1 原幣 = ? TWD`。rates.TWD 固定 1；每個外幣有發布日期，缺幣別即缺值。上游失敗 503 `SERVICE_UNAVAILABLE`，沒有杜撰的外幣兜底。HTTP 回應 no-store，上游保留既有 900 秒 revalidation；日期不是取得時間或即時報價。

Web 設定 Action 與 HTTP 共用 currencySettings／tripManagement 的父旅行交易與正規化；管理員資格在交易內重驗。revision 只覆蓋幣別設定，不因名稱／封存或帳務改變失效；同內容回到原狀可使用相同 revision，並非單調計數。舊 revision 409 `RESOURCE_CHANGED`、降為一般成員 403 `FORBIDDEN`、失去成員資格 404 `NOT_FOUND`。確認寫入與 `trip.currency` receipt 原子提交，UUID／凍結內容重播不覆蓋之後的新設定；終局拒絕可依原 UUID 查回。receipt 仍需目前成員資格，不使用 G1c 成功退出例外；不同 body／operation 同 UUID 409。

設定寫入不讀外部匯率，不改任何 expense／payment，也不更新 C 已確認 body。舊 App TWD／匯率 1 契約維持；外幣新增／預覽已由 G2b 擴充；編輯見 G2c。

## G2b 原幣預覽與新增

- `expense-options` 加可選 currencySettings（snake_case 設定內容或 null）與 supportedCurrencies。僅成員可讀，同一次 Trip 查詢取得名冊與設定；舊 App 忽略新增欄位。沒有私人預算、分享碼或其他帳務。
- `expenses/preview` 舊 `{ amount, member_ids }` 保留 TWD／1，回應仍 `{ amount, splits }`。新 `{ amount, currency, exchange_rate, member_ids }` 必須同時提供幣別與匯率；amount 為原幣，回應另含 originalAmount／currency／exchangeRate，amount 與 splits.shareAmount 仍為 TWD。幣別用後端支援清單；匯率有限正數、方向 TWD／原幣、TWD 固定 1。原幣至少 0.01、至多兩位小數且分為安全整數；TWD 原額及換算後 TWD／份額上限仍為 1,000,000,000。溢位、不支援或成員變動 400，不留 receipt。
- `expenses` 放寬既有 currency／exchange_rate，原幣驗證同上，完整匯率不做格式化後回寫。Web createExpenseForActor 再驗換算、成員、日期、加總與交易；預覽 shares 源自 Web 的原幣分角再換算，不能在手機另算 TWD 均分。很小的有效換算依既有規則可取整為零。已提交 receipt 重播不重取設定或匯率；原 UUID 不同匯率仍 409，刪除後不復活、撤權不能重播／查詢。

回應 runtime schema 檢查 TWD 到分、分攤加總／唯一成員與完整原幣回音；手機 confirmedFields 再確認屬於当前原幣／匯率／成員。C SQLite 讀取同步使用擴充 create schema，D raw draft 新欄位可選，schema 8 無遷移、舊紀錄原內容不改。D TWD 佇列在引擎、SQLite enqueue／prepare 與同步都拒絕外幣；保存草稿不等於允許離線送出。外幣編輯見 G2c。

## G2c 原幣均分編輯

沿用 E3 的 edit-context／PATCH／mutation-requests。context 的 options 補 G2b 幣別設定／支援清單及虛擬旗標；capabilities.recalculate 為可選 boolean，支持 TWD／外幣均分重算。equal 仍只代表舊 App 的 TWD 能力，reason 保留原 enum。recalculate 需要完整合法原額／匯率、換算總額與現存 TWD 金額一致、付款人／分攤在目前名冊，以及份額逐人等於 computeSplits 的原幣均分結果；不同尾差／非均分／無效歷史資料只允許 basic。DB 沒有原始模式，數值相同者無法辨識最初使用哪種模式。

mode=equal 的 changes 可成對新增 currency／exchange_rate，original_amount 沿用 G2b 原幣安全到分規則，TWD／換算後總額與每份 TWD 分攤上限不變。TWD rate 固定 1；ISO 語法由 contracts 驗證、後端核對支援清單。未帶兩欄的舊 body 嚴格按 TWD／1 處理且不補欄位，不改舊指紋；僅帶一欄／無效 rate／未知欄位為 400。後端再以目前名冊與請求原額／匯率計算每份 TWD，偽造份額、不可重算或換算溢位為終局 409 VALIDATION_ERROR；Web／成員修改原始業務欄位仍為 409 RESOURCE_CHANGED。基本更新完全不重算歷史金額。

支出、活動與終局 E receipt 同交易；原 UUID 重播不套新設定、後續編輯或匯率，不新增 migration。撤權仍拒絕重播／查詢。Mobile 預覽使用 G2b 原幣形狀、確認後才進 E；SQLite 原 body、共用限速期限、帳號／環境及登入世代隔離保持，故障／裝置交接見 [G2c](LOCAL_ACCEPTANCE.md#g2c-外幣編輯交接)。

## G3a-1 進階分攤預覽

`POST /api/v2/trips/:id/expenses/preview` 保留 v2 的 `base_currency`、`amount`（原幣總額）、`currency`、`exchange_rate`、`member_ids`；新增可選 `split`。省略時仍為均分，回應與舊版相同，不補預設欄位至既有確認 body／receipt 指紋。

| split                                                | 輸入與限制                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| `{ mode: "equal" }`                                  | 均分；不能帶 `values`。                                                |
| `{ mode: "amount", values: [20, null, null] }`       | 原幣固定金額，非負、至多兩位小數、整數分須安全可表示；留空者均分餘額。 |
| `{ mode: "percent", values: [33.33, 33.33, 33.33] }` | 每人 0–100，至多兩位小數；留空者均分剩餘百分比。                       |
| `{ mode: "shares", values: [1, 2, 3] }`              | 每人 0–1,000,000，至多四位小數；留空為 1。                             |

`values` 與 **請求中的** `member_ids` 一對一、等長，成員仍為 1–100 位且不可重複；不接受缺項、多項、數字字串、空字串、布林或其他欄位。`null` 才是留空，`0` 是明確不分攤；全部明填零一律拒絕，含總額只有一分的情況。未填的表單文字由後續 Mobile 草稿保存，送預覽前必須完整驗證後轉 JSON number／null，不能用寬鬆 `parseFloat` 接受部分字串。

先依 ID 對應輸入，再按 `expense-options` 的加入時間／同時刻儲存順序呼叫 Web 的 `computeLedgerSplits`；虛擬與同名成員以 ID 區分，已移除或帳號不存在者不能選。固定值／百分比全部填完卻不足、或手填超額時，以原幣差額到分後的 **0.01 容差** 判定，超過回 `400 VALIDATION_ERROR`，不發出可確認預覽。這不是百分比容差：33.33% 三人分 100 可以，分 1,000 少 0.10 則拒絕。容差內仍以最大餘數法補齊原幣份額，之後用完整匯率分配基準份額；同餘數依穩定名冊順序，請求排序不能移動尾差。零基準總額／零個人份額有效；原幣安全分、共用 roundMoney 不得漂移、基準單筆 1,000,000,000 上限及同幣匯率 1 沿用 B。

明確帶 `split` 時，回應在既有 `ledger`、`amount`（基準總額）、`originalAmount`、`currency`、`exchangeRate`、`splits` 上，新增 `splitMode`，每個 split 新增 `originalShareAmount`。原幣份額及基準 `shareAmount` 各自到分加總等於相應總額。只回選中成員，不回傳帳號、Email、歷史輸入或私人資料。預覽仍為成員授權後的唯讀操作、8 KiB JSON／no-store；不保留鎖、UUID 或資料庫紀錄，不能代表稍後寫入必然成功。

**能力與部署**：`GET /expense-options` 新增可選 `splitPreviewModes: ["equal", "amount", "percent", "shares"]`；缺欄位按僅有舊均分預覽處理。全域 `/capabilities` 保持原嚴格形狀，避免舊 App 拒絕新增 key。`splitPreviewModes` 只宣告預覽，不能據此開放進階新增／編輯；寫入能力另見下節 G3a-2，UI／草稿在 G3b，需相容後端先部署。舊請求的 revision、原 UUID 與 receipt 指紋不變。

**歷史與保存決策**：新舊帳本均繼續只保存最終金額／份額，暫不新增持久化分攤模式或原始意圖，避免只有 Mobile 維護而被 Web 修改後失真。不能從最終份額推斷原百分比／份數或宣稱還原模式；基本編輯保留原帳，後續進階重算須重新選模式及明確確認。草稿與確認待送 body 可保存使用者當次意圖，但不是歷史支出的模式來源。本片不提供歷史固定金額預填。D 仍只允許 TWD 基準＋TWD 原幣＋均分，非均分不得因結果相等就降級入列。非 TWD 新建開關保持關閉，裝置驗收另列。

## G3a-2 進階分攤新增與編輯

`POST /api/v2/trips/:id/expenses` 新增可選 `split`，格式及限制沿用 G3a-1。`values` 此時與 **確認 body 的 `splits` 順序**一對一；每列仍是 `{ user_id, share_amount }`，`share_amount` 為確認的基準份額。若把預覽結果重新排序，必須按 ID 同步重排 values，不能沿用預覽請求的陣列索引。省略 `split` 保持舊建立 body、Web 驗證／分攤語意及 receipt 指紋，不補預設模式。

`PATCH /api/v2/trips/:id/expenses/:expenseId` 新增明確 `mode: "split"`，保留 `base_currency`、`client_request_id`、`expected_revision`。`changes` 必填 `original_amount`、`currency`、`exchange_rate`、`payer_id`、`splits` 與 `split`；可同時帶基本欄位 description／category／date。不接受附件、標籤或行程欄位。基本編輯仍只寫使用者指定的基本欄位；原 `mode: "equal"` 的歷史可編輯判斷及請求格式不變。

新模式不推測舊帳分攤方式；歷史非均分或含已移除成員的支出可以重新指定目前有效付款人／成員、完整原幣金額／匯率及模式，預覽確認後替換帳務。不能自動帶入推估模式、默默去掉歷史成員或改成均分。舊欄位、附件、標籤、行程與建立者在基本編輯保留原值，在重新分攤時亦只更換明確指定的帳務及基本欄位。資料庫繼續不保存模式；確認請求的完整意圖參與指紋，receipt 保留終局結果。

後端在原 trip fence 交易的 snapshot 中核對目前存在的使用者／旅行成員，採與預覽一致的加入時間／儲存順序及 Web `computeLedgerSplits` 重算。確認份額須逐人**完全相等**，連尾差一分也不能轉給另一人；不套用舊建立流程的金額容差修補確認。模式輸入的平衡仍遵守 G3a-1 的原幣容差。基準金額零、個人零份額、虛擬成員、外幣及極端合法匯率沿用既有規則。

授權先於 body／receipt；相同 UUID／完整 body 重播既有終局結果，不因之後成員或支出改變而再次寫入，已撤權者仍不能查回。不同 body 沿用該 UUID 回 `409 IDEMPOTENCY_CONFLICT`。格式錯誤先回 `400 VALIDATION_ERROR`；交易內新增核對不符會保存 `VALIDATION_ERROR` 拒絕（POST 400，PATCH 409），編輯 revision 過期保存 `RESOURCE_CHANGED`。未知 DB 故障仍回滾支出、activity 及 receipt，不把未確認結果誤記為終局；待確認恢復沿原 UUID，不自動換 key 重送。

能力採相容的可選欄位：`expense-options.splitCreateModes` 宣告四種新增模式，`edit-context.capabilities.splitModes` 宣告四種明確重算模式；缺欄位即不開放相應功能。`splitPreviewModes` 與舊 `equal`／`recalculate` 不能替代這兩個能力，嚴格的全域 capabilities 保持不變。HTTP body 總限制仍為 8 KiB。G3b-1 已接手機新增、原始文字草稿與 D 非均分防線，見 [手機現況](FEATURES.md#g3b-1-進階新增與草稿)；G3b-2 已接進階編輯、新舊比較與 E 原 UUID 恢復，見 [編輯現況](FEATURES.md#g3b-2-進階支出編輯)。裝置驗收仍待後續，沒有 migration 或非 TWD 新建開關變更。

驗證集中在 `expenseSplitConfirmation.test.ts`、`mobileExpenseWrite.integration.test.ts`、`expenseMaintenance.integration.test.ts` 與 `test:mobile-api`：含四模式、精確確認、同 UUID 並發／回應遺失／重播、歷史非均分、成員變動／撤權、Web 所改業務欄位的 revision 衝突、原欄位保留及交易回滾。隔離資料庫測試也覆蓋 USD／JPY 基準、零換算與合法匯率上下界；真機驗收另列 LOCAL_ACCEPTANCE。

## G4a 個人預算

- `GET /api/v2/trips/:id/budget` 回傳 `ledger`、`tripId`、本人預算 HMAC `revision`、`budget`（null 或 total／categories）與全量 `progress`。progress 包含 total、totalSpent、remaining、hasBudget 與分類 budget／spent／remaining；remaining 為負表示超支，沒有該項預算則 null。只讀登入者預算，不接受使用者 ID 參數、不輸出其他成員或 legacy budget。
- `POST` 同一路徑接受嚴格的 `BudgetInput`：`client_request_id`、`expected_revision`、`base_currency`、`total`（null 或非負金額）、完整 `categories` 陣列。分類限七種、不得重複；每欄最多兩位小數及 1,000,000,000，零代表移除。總額與分類獨立，可只設分類或分類合計高於總額；不是部分更新。
- 寫入共用 Web `writeWebSettings(..., 'budget', ...)`／`normalizeBudget`，一般成員可改本人設定。revision 只綁本人原預算及單位；同人並行變更保存 `409 RESOURCE_CHANGED` 終局，UUID 不同 body 回 `409 IDEMPOTENCY_CONFLICT`。成功為 `{tripId, updated: true, ledger}`，不攜帶私人金額。
- `budget.set` 復用 Web 既有 actor／UUID receipt namespace、parent fence 與交易；Mobile receipt adapter 只補回應的 resourceId，不改舊 receipt／指紋。`GET /mutation-requests/:uuid` 重授權目前成員，重播不覆蓋後續新預算；撤權者不能讀原結果。格式錯誤在寫入前 400；未知 DB 錯誤整筆回滾。沒有 migration。

手機透過 E 的 pending_mutation 保存確認內容，SQLite schema 10 不增加表；普通離線草稿不保存預算。API／進度不混用 TWD 與其他基準幣，支出單位錯誤保持 fail-closed。部署順序仍是相容後端先於新 App；裝置待驗見 [G4a](LOCAL_ACCEPTANCE.md#g4a-個人預算交接)。

## G4b 搜尋與分析

`GET /api/v2/trips/:id/expense-search` 是相容新增端點；舊 `/expenses` 清單與游標不變。先驗 Bearer 成員，再在 `withTripReadInDatabase` snapshot 重驗授權與完整帳本單位。參數集中於 `expenseSearchInputSchema`：

- `keyword`：trim 後最多 200 字；省略或空白不篩選，描述／付款人名稱的大小寫不敏感字面搜尋，不接受正規表示式或搜尋隱藏標籤。
- `category`：既有七分類；未知歷史分類併入 other。`payerId`：ObjectId 或 `missing`（解析不到使用者的歷史參照）；同名依 ID 區分，不按姓名猜。選項列出全旅行曾付款者，不代表現任成員資格。
- `dateFrom`／`dateTo`：真實 YYYY-MM-DD，與 Web DTO 的 date-only 規則一致，含兩端；單邊可省略，起日不得晚於迄日。所有條件 AND 組合。未知或重複鍵、非法格式皆 400。
- `cursor`：端點專用的 revision／位移，綁登入者、旅行、ledger、正規化條件與全量讀取資料；不可沿用舊清單游標。每頁 20 筆，依 date／createdAt／id 降冪。條件、使用者顯示資料或支出變動導致 `409 RESOURCE_CHANGED`，須從第一頁重讀；不宣稱跨請求保留 DB snapshot。

`ExpenseSearchResult` 必帶 ledger、filters、revision、items（逐列 ledger）、nextCursor、全旅行 payers，以及同一次快照／同條件的 summary：count／total／mySpent、categories 的分類／筆數／總額、members 的姓名／ID／虛擬旗標／paid／share。sum 與 normalizeShares 沿 Web `toExpenseDto`、`filterExpenses`、`computeTripStats`，無手機金額引擎。未解析成員的付款及分攤仍納入總額，不因參照消失丟帳；非 TWD 帳本不轉為 TWD。沒有公開路由，沒有私人預算、帳號、Email、附件、標籤、行程或 receipt 欄位。

後端目前讀全旅行必要投影後共用 Web 篩選／計算，再切頁；不是 MongoDB 全文索引或大型資料效能承諾。沒有 index／DB migration、寫 fence 或 receipt。舊後端缺端點仍需先部署相容後端，再發布新 App；跨旅行統計及其基準幣分組另排。

## G6a 私人收據閱讀

- `GET /api/v2/trips/:id/expenses/:expenseId/attachments` → `{ ledger, items: [{ id, contentType, size }] }`。id 是後端由儲存 key 產生的 SHA-256 opaque identifier；不提供 key、檔名、預簽名 URL 或其他支出欄位。空清單可用，最多沿 Web 的 10 個附件及單檔 8 MiB；格式為 JPEG／PNG／WebP／PDF。
- `GET .../attachments/:attachmentId` → `{ ledger, id, contentType, size, url, expiresAt }`。HTTPS 短效 GET URL 與毫秒 Unix 到期時間，最多 300 秒；每次開啟重新取得。只簽目前支出已參照的物件，任意 key／其他支出／其他旅行無法借此簽名。
- 僅 bearer 成員、ObjectId 路徑；不存在／未授權旅行 `404 NOT_FOUND`，支出消失或不屬於旅行 `404 EXPENSE_NOT_FOUND`，未附加／遺失／大小或 MIME 不符的檔案 `404 ATTACHMENT_UNAVAILABLE`。DB 附件中繼資料不合法 `503 ATTACHMENT_DATA_INVALID`；R2 設定／服務故障是可重試失敗，不冒充空清單。手機只在實際旅行拒絕時 deny catalog，單檔不存在不封鎖旅行。
- 成員與支出參照於只讀 snapshot 核對，沿 Web 的 `isReceiptKeyForTrip`／`headObject`／`presignGet`；外部儲存等待完成後再開新授權快照核對資格與參照，才交出 URL。沒有 writer fence、帳務異動、receipt 寫入或 DB migration。
- JSON API 維持 `Cache-Control: no-store`／`Vary: Authorization`，新簽名加入 R2 `response-cache-control=private, no-store`。原 Web `presignGet` 預設與 public／一般 expense DTO 不變；公開分享仍沒有收據。R2 連結不是可即時撤銷的 session：已交出的連結最長仍可使用至到期，外部下載由 OS／瀏覽器管理。

先部署新增 v2 端點再提供需要它的 App。附件寫入見下節 G6b；原生交付另排；實際 R2／裝置下載未由隔離測試替代。

## G6b 收據附件寫入

新增 `/api/v2/trips/:id/expenses/:expenseId/attachment-requests`：POST 接受嚴格 receiptWriteInput，add 為 UUID／MIME／bytes，remove 為 UUID／opaque attachment ID。GET `/:uuid` 查狀態；POST `/:uuid` 接受 upload／finish／cancel。回應含 ledger／原 UUID／not_found、pending、committed 或 rejected；拒絕帶 code。新端點使用附件專用 UUID namespace，舊 App 不需改 body；先部署相容後端。

後端 receiptWrite.ts／receiptwrites 以 actor＋小寫 UUID 為唯一鍵，固定旅行、支出與輸入；同 UUID 改內容回 409 IDEMPOTENCY_CONFLICT。讀取／重播皆重驗成員，附件參照與終局共用 Trip fence／MongoDB 交易。新增推入附件，移除只按 ID 移除；不替換其他附件或財務欄位。移除已不存在的附件仍能結案。finish 前 HEAD 核對 MIME／bytes，等待後再驗成員、支出、10 份上限及 retirement tombstone；storage 故障／UPLOAD_INCOMPLETE 保持 pending。

upload 簽名 120 秒，須以相同 Content-Type、`If-None-Match: *` PUT，不攜帶 API token。獨立 signer 使用 WHEN_REQUIRED checksum，避免 SDK 簽入空檔案 checksum；conditional header 綁定簽名，舊連結不可覆寫已存在物件。412 仍需 finish／HEAD 核對，不直接當成功。支援依 [R2 官方表](https://developers.cloudflare.com/r2/api/s3/api/)，指定測試 bucket 的實際 PUT／HEAD／CORS 仍待驗。

pending 固定 24 小時期限，最後 120 秒不再簽 PUT；取消／到期／支出已刪除／上限拒絕保存終局，無引用 key 交既有 blobcleanupjobs／trip-cleanup cron 雙次清理。cron 每次最多處理 25 筆過期操作，撤權或旅行消失也可清理；終局與 tombstone 不 TTL 刪除，避免重播復活。共用引用不刪其他支出仍使用的物件。沒有遠端 migration 或 R2 設定變更。
