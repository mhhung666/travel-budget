# 支出背景通知：驗收與維運

2026-09-16 依使用者接受決定結案；未取得的證據不記為實測通過。

| 範圍                                                                                 | 結果                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------ |
| 支出 CRUD、活動紀錄、done 計數、inspect 200／401                                     | 正式站通過                                 |
| iPhone 系統推播與站內通知                                                            | 使用者確認收到                             |
| 重試、租約接手與失敗恢復                                                             | 264 項相關測試＋29 項隔離 MongoDB 測試通過 |
| 部署 commit、排程實際執行、逐事件 checkpoint、平台中斷恢復、延遲量測、舊 inspect 503 | 接受免驗／免追查，沒有完整平台證據         |

## 啟用與日常檢查

- 先盤點並套用 `20260907170000-expense-delivery-indexes.js`，再部署相容程式；當時共用 DB 已完成此 migration，不代表其他 migration 已執行。
- 預設啟用，`EXPENSE_BACKGROUND_DELIVERY=off` 僅停止新工作；保持 `CRON_SECRET` 與受保護的 `/api/cron/expense-delivery` 排程。
- 既定每日補撿為 UTC 12:00，一次只跑一筆／一批。`after` 不是獨立排程，須觀察 pending 最舊時間與排空能力；實際排程以部署設定為準。
- 唯讀使用 Bearer 認證的 `?inspect=1`，取得狀態計數與 `oldestPendingAt`；逾時回 503。一般 cron GET 會認領並可能寄通知，不能當唯讀健康檢查。
- dead 依 `lastError` 與 checkpoint 盤點；不要清 checkpoint 或重建舊通知。本版無自動復活 dead 的公開 API。

## 回退與限制

停止新工作，保留 worker／索引直到既有工作排空，再回退程式。migration down 刻意不刪去重索引；不能用 TTL 刪除附帶工作狀態的業務支出。

Provider 接受後、checkpoint 保存前中斷仍可能重送；accepted 不代表裝置收到。固定候選以外的新裝置不補發，未設 VAPID 時只保存站內通知／活動。通知去重與 [離線新增支出去重](../details/OFFLINE_EXPENSE_RETRY.md) 是不同層次。
