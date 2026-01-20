# ⚠️ Phase 7 部署必要步驟

## 🚨 重要提醒

**Phase 7 的代碼已經全部完成,但 Supabase 數據庫尚未更新!**

在你可以使用 Phase 7 的新功能之前,你必須執行以下步驟:

---

## 📝 必須執行的步驟

### 步驟 1: 執行 Supabase SQL 更新

1. **登入 Supabase Dashboard**
   - 前往: https://supabase.com/dashboard
   - 選擇你的專案

2. **打開 SQL Editor**
   - 在左側選單點選 "SQL Editor"
   - 點選 "New query"

3. **執行以下 SQL**

複製並執行 `scripts/phase7-schema-update.sql` 的內容:

```sql
-- Phase 7: 支出編輯與多幣別功能 - 數據庫 Schema 更新

-- 為 expenses 表格新增幣別相關欄位
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'TWD';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10, 6) DEFAULT 1.0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10, 2);

-- 為現有資料設定預設值 (向後相容性)
UPDATE expenses
SET currency = 'TWD',
    exchange_rate = 1.0,
    original_amount = amount
WHERE original_amount IS NULL;
```

4. **點擊 "Run" 執行 SQL**

5. **確認執行成功**
   - 應該看到成功訊息
   - 沒有錯誤訊息

---

## ✅ 驗證更新

執行 SQL 後,你可以在 SQL Editor 執行以下查詢來驗證:

```sql
-- 檢查 expenses 表的結構
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'expenses'
ORDER BY ordinal_position;
```

**應該看到以下新欄位**:
- `currency` (TEXT, DEFAULT 'TWD')
- `exchange_rate` (NUMERIC, DEFAULT 1.0)
- `original_amount` (NUMERIC)

---

## 🚀 測試新功能

Supabase 更新完成後,你可以:

1. **啟動開發伺服器** (如果還沒啟動)
   ```bash
   npm run dev
   ```

2. **測試新增外幣支出**
   - 選擇幣別 (JPY, USD, EUR, HKD)
   - 輸入金額和匯率
   - 確認自動換算正確

3. **測試編輯支出**
   - 找到你建立的支出
   - 點擊「編輯」按鈕
   - 修改金額或幣別
   - 確認更新成功

---

## 📊 當前狀態

### ✅ 已完成
- [x] 所有代碼已撰寫
- [x] TypeScript 編譯成功
- [x] lib/db.ts 已更新 (本地 SQLite)
- [x] 文檔已完成
- [x] SQL 腳本已準備

### ⏳ 待完成
- [ ] **執行 Supabase SQL 更新** ← **你現在需要做這個!**
- [ ] 測試新功能
- [ ] 部署到生產環境

---

## 🔧 常見問題

### Q: 為什麼 lib/db.ts 不夠?
**A**: `lib/db.ts` 只是本地 SQLite 的定義檔,用於一些輔助腳本。這個專案實際使用的是 **Supabase (PostgreSQL)**,所以必須在 Supabase Dashboard 執行 SQL。

### Q: 如果忘記執行 SQL 會怎樣?
**A**: 新功能會出現錯誤,因為:
- API 會嘗試讀取/寫入不存在的欄位
- 前端會收到錯誤訊息
- 現有支出可能無法正確顯示

### Q: 執行 SQL 會影響現有資料嗎?
**A**: 不會!SQL 腳本包含:
- `ADD COLUMN IF NOT EXISTS` - 安全地新增欄位
- `WHERE original_amount IS NULL` - 只更新新欄位為空的記錄
- 現有支出會自動設為 TWD,金額不變

### Q: 可以在本地測試嗎?
**A**: 可以,但你仍然需要在你連接的 Supabase 實例執行 SQL。如果你使用的是 Supabase 的雲端服務,就必須在 Dashboard 執行。

---

## 📞 需要幫助?

如果遇到問題:
1. 檢查 Supabase 的錯誤訊息
2. 確認 SQL 語法正確
3. 查看 [PHASE7_COMPLETED.md](./archive/PHASE7_COMPLETED.md) 的詳細文檔

---

**記住**: 執行 Supabase SQL 更新後,Phase 7 的所有功能就可以使用了! 🎉
