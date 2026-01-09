-- Phase 6: Schema Updates
-- 此腳本需要在 Supabase SQL Editor 執行

-- 1. 在 trip_members 表格新增 role 欄位
ALTER TABLE trip_members ADD COLUMN role TEXT DEFAULT 'member';

-- 新增註解說明角色類型
COMMENT ON COLUMN trip_members.role IS 'User role in trip: admin (creator) or member';

-- 2. 在 trips 表格新增 hash_code 欄位
ALTER TABLE trips ADD COLUMN hash_code TEXT UNIQUE;

-- 新增註解
COMMENT ON COLUMN trips.hash_code IS 'Short hash code for easy sharing (e.g., a7x9k2)';

-- 3. 建立 hash_code 索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_trips_hash_code ON trips(hash_code);

-- 4. 建立 role 索引
CREATE INDEX IF NOT EXISTS idx_trip_members_role ON trip_members(role);

-- 驗證變更
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'trip_members' AND column_name = 'role';

SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'trips' AND column_name = 'hash_code';
