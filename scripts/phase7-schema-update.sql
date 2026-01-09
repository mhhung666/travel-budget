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

-- 欄位說明:
-- currency: 幣別代碼 (TWD, JPY, USD, EUR, HKD)
-- exchange_rate: 對 TWD 的匯率 (例如: 1 USD = 31.5 TWD，則 exchange_rate = 31.5)
-- original_amount: 使用者輸入的原始幣別金額
-- amount: 自動計算的 TWD 金額 = original_amount × exchange_rate (用於結算計算)
