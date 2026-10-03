# 後端分工與 API 契約

手機沿用同一 repository 中 `apps/web` 的後端與資料庫。唯讀切片（登入、旅行、支出清單／明細、結算）的端點已實作，尚未代表任何遠端環境已部署。

## 已實作端點

基底路徑 `/api/v1`。手機與後端透過 `@travel-budget/contracts` 共用 schema，單一來源為 [packages/contracts/src/index.ts](../../../packages/contracts/src/index.ts)，OpenAPI 產物為 [packages/contracts/openapi.json](../../../packages/contracts/openapi.json)。從 repository 根目錄執行 `pnpm contracts:generate` 更新產物，`pnpm contracts:check` 檢查同步。手機沒有 Web source 或 DB 相依。

| 端點                                     | 輸入／回應                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `POST /auth/login`                       | JSON `{ username, password }` → `{ accessToken, refreshToken, expiresIn, user }` |
| `POST /auth/refresh`                     | JSON `{ refreshToken }` → 新 token pair 與目前 user                              |
| `POST /auth/logout`                      | JSON `{ refreshToken }` → `{ loggedOut: true }`；無須有效 access token           |
| `GET /me`                                | Bearer access token → `{ id, username, displayName }`                            |
| `GET /trips?page=1&date=YYYY-MM-DD`      | Bearer → `{ items, nextPage }`；每頁 20 筆                                       |
| `GET /trips/:id/landing?date=YYYY-MM-DD` | Bearer；僅 ObjectId → 受限成員摘要                                               |
| `GET /trips/:id/expenses?cursor=…`       | Bearer → `{ items, nextCursor }`；每頁 20 筆，游標無效回 400                     |
| `GET /trips/:id/expenses/:expenseId`     | Bearer → 單筆明細：原幣／TWD 金額、匯率與各成員 TWD 分攤                         |
| `GET /trips/:id/settlement`              | Bearer → 餘額、建議轉帳（尚未付款）、既有還款、總額與三種狀態                    |

成功 envelope 是 `{ data }`；失敗是 `{ error: { code }, requestId }`。所有回應 `Cache-Control: no-store`，429 帶 `Retry-After`。僅接受 JSON body，大小上限 8 KiB。沒有跨來源瀏覽器 CORS；原生請求不使用 Web cookie。

Trip DTO 包含 `id/name/description/startDate/endDate/destination/archived/memberCount/mySpent/myBalance/phase`。Landing 加入 `role/expenseCount/todayGroupSpent/budgetTotal`。日期為 date-only，金額為 TWD、保留既有到分規則；`myBalance` 正數是應收，負數是應付。沒有成員私人預算陣列、分享碼、檔案 key 或收據。

支出清單按 `date`、`createdAt`、`_id` 降冪，游標編碼最後一筆的三個值，因此同日同時間的資料不會跨頁漏掉或重複；分頁不是快照，資料變更後從第一頁重讀。清單與明細 DTO 為明確白名單：id、日期、說明、分類（未知值歸為 `other`）、付款人、TWD 金額、原幣金額與幣別；明細另有匯率與各成員分攤。不輸出附件、標籤、行程關聯、登入帳號或分享碼。付款人或分攤成員的參照已不存在時，id 為 `null`、名稱為空字串。

結算沿用 `readSettlement` 的餘額與最少轉帳計算（已先扣除已登記還款），`suggestedTransfers` 帶成員 id 以辨識同名成員，全部尚未付款；`status` 為 `empty`（無支出也無還款）、`settled` 或 `outstanding`（任何餘額未歸零即為此狀態）。結算仍讀取該旅行全部支出與還款，游標分頁不代表結算查詢有最佳化。

上述三個端點只接受成員 ObjectId：非成員、失去資格、分享碼、格式錯誤、不存在或屬於其他旅行的支出一律 404，不 fallback 到 public API。

旅行列表沿用 Web 共用服務先讀取本人全部旅程與摘要，再排序、分頁；HTTP payload 有界，DB 工作量仍隨本人旅程數增加。分頁不是快照，Web 有變更後應從第一頁重新整理。`date` 由手機以本地日曆日提供，未提供時使用伺服器 UTC 日。

## 認證與失敗語意

- 沿用既有「帳號／密碼」，不是 Email 登入。Web 與手機共用 credentials check，但建立不同 session。
- access JWT 有效 15 分鐘，refresh／裝置 session 絕對有效期 30 天。手機 signing key 從既有後端密鑰做 domain separation，並驗證 issuer／audience；手機 JWT 不能當 Web cookie 使用。
- MongoDB 只保存 refresh token 雜湊及密碼雜湊的 keyed fingerprint。每次授權檢查 session 撤銷／到期、帳號與目前密碼；網站變更／重設密碼後手機憑證立即失效。
- refresh 以原子 compare-and-swap 單次輪替；已消耗但簽章有效的 refresh 重放會撤銷整個裝置 session。手機合併併發 refresh，禁止自動重試 refresh POST。若伺服器已輪替但回應遺失，下一次可能需要重新登入；不承諾跨當機的輪替恢復。
- 收到輪替結果但 SecureStore 寫入失敗時，手機停止使用舊 session、清除私人快取與舊憑證，並嘗試撤銷新憑證。清除成功後回到登入頁；若安全儲存仍無法清除，顯示儲存錯誤與重試，不假稱已完成本機清除。
- 登入按正規化帳號與 15 分鐘時段限制每段 10 次嘗試；429 的等待期間手機會尊重 `Retry-After`。
- 401 最多更新並重送一次；更新或重送再次 401 清除登入與私人快取。403／404 不走 public API。網路／逾時／5xx 由使用者明確重試。
- 重開 App 離線時保留 SecureStore，顯示恢復登入失敗與重試。登出需要連線完成撤銷；失敗保留登入，避免假稱成功。
- 後端新增 `20261002100000-mobile-session-expiry.js` TTL migration；未執行時有效期檢查仍生效，但過期紀錄不保證自動清理。此實作未執行任何遠端 migration。

## 尚未實作

支出新增與均分預覽、成員資料、冪等 request ID 與結果查詢、SQLite 待確認紀錄／outbox、附件 begin／finish、推播及帳號刪除均屬後續工作（見 [路線](ROADMAP.md)）。未來支出寫入仍須抽出共用 service，不得複製分帳演算法。

outbox 必須按帳號／環境隔離，重試沿用 request ID，過期登入暫停同步；快取清除不刪待送資料。AI 只產生草稿，正式寫入需使用者確認。
