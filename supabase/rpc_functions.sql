-- ============================================================
-- 在 Supabase SQL Editor 執行這個檔案一次
-- ============================================================

-- 刪除指定行程日並重新連續編號
-- 用負數中繼值避免 unique constraint 衝突
CREATE OR REPLACE FUNCTION delete_and_renumber_itinerary_day(
  p_day_id  INT,
  p_trip_id INT
) RETURNS void AS $$
BEGIN
  -- 1. 先把所有 day_number 改成負數，避免後續重新編號時 unique constraint 衝突
  UPDATE itinerary_days
  SET    day_number = -day_number
  WHERE  trip_id = p_trip_id;

  -- 2. 刪除目標行程日（此時它的 day_number 已是負數）
  DELETE FROM itinerary_days
  WHERE  id       = p_day_id
    AND  trip_id  = p_trip_id;

  -- 3. 用 ROW_NUMBER() 一次重新編號剩餘的行程日
  --    ORDER BY day_number DESC：負數愈大（愈接近 0）代表原本的序號愈小
  UPDATE itinerary_days AS d
  SET    day_number = sub.new_number
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY day_number DESC) AS new_number
    FROM   itinerary_days
    WHERE  trip_id = p_trip_id
  ) sub
  WHERE d.id = sub.id;
END;
$$ LANGUAGE plpgsql;
