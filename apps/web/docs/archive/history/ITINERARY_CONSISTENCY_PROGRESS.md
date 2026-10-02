# 行程與資料一致性交付摘要

截至 2026-09-12：R1–R4 工程與隔離 MongoDB 測試完成；使用者回報 migration 與 push 完成，正式競態／清理驗收仍不完整。

- 行程以穩定活動 ID、revision 與原子更新阻擋舊草稿覆蓋。
- 成員轉換／移除、行程、支出、相片等 writer 使用 Trip fence 交易；需 replica set 或 sharded MongoDB。
- 移除最後附件引用時建立 `blobcleanupjobs` 永久 tombstone；晚到引用回 `CONFLICT`，必須換新 key。
- 旅程／物件清理由持久工作重試；票券驗證採有界平行查詢。
- 正式站已驗行程日與活動 CRUD、跨分頁草稿衝突、PDF 票券正常流程及未授權 cron 401；完整範圍見 [正式抽驗](../tests/PRODUCTION_ACCEPTANCE_2026-09-12.md)。

## 部署與回退

先停寫並盤點 migration，建立 trip／blob cleanup 工作索引，再部署全部相容 writer 與 worker，最後恢復寫入。不能混用未檢查 tombstone 的舊 writer；回退也須停寫、處理未完成工作並保留 tombstone。實際 migration 以 [遷移操作](../details/MIGRATIONS.md) 與程式為準。

仍待核對部署 commit、migration／writer 同時上線、成員與跨 collection 競態、R2 最終刪除及 cron 執行紀錄。UI 刪除成功不代表物件已清完。

## 本機重跑

在 `apps/web`，使用可丟棄的隔離 replica set：

```bash
MONGODB_MEMBER_TEST_URI='mongodb://127.0.0.1:27030/?replicaSet=r3test' \
  MONGODB_MEMBER_TEST_ALLOW_WRITES=1 \
  pnpm exec vitest run src/__tests__/memberIdentity.integration.test.ts
```

測試建立並刪除自己的隨機資料庫；不使用正式 URI。逐段交付與歷史驗證查 Git。
