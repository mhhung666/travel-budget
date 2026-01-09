# Phase 6 執行指南

這份文件將引導你完成 Phase 6 的所有設定與部署。

---

## 📦 已完成的準備工作

✅ **Step 1**: 數據庫 Schema 更新腳本已準備
✅ **Step 2**: Hash code 生成工具已實現
✅ **Step 3**: 權限檢查系統已完成
✅ **Step 4**: 所有後端 API 已更新完成

**你現在需要做的**: 執行數據庫遷移並測試

---

## 🌙 晚上執行步驟 (約 15 分鐘)

### 步驟 1: 備份數據庫 (2 分鐘)

1. 登入 [Supabase Dashboard](https://supabase.com/dashboard)
2. 選擇你的專案
3. 左側選單 → **Database** → **Backups**
4. 點擊 **Create backup**
5. 等待備份完成 ✅

### 步驟 2: 執行 Schema 更新 (3 分鐘)

1. 在 Supabase Dashboard,點擊左側 **SQL Editor**
2. 點擊 **New query**
3. 開啟本地檔案 `scripts/phase6-schema-update.sql`
4. 複製全部內容貼到 SQL Editor
5. 點擊 **Run** (或按 Ctrl+Enter)
6. 確認看到成功訊息 ✅

**預期結果**:
```
Success. No rows returned (statement 1)
Success. No rows returned (statement 2)
...
```

### 步驟 3: 驗證 Schema (2 分鐘)

1. 在 Supabase,左側 **Table Editor**
2. 點擊 `trips` 表格
   - 確認有 `hash_code` 欄位 ✅
3. 點擊 `trip_members` 表格
   - 確認有 `role` 欄位 ✅

### 步驟 4: 執行數據遷移 (5 分鐘)

1. 開啟終端機 (Terminal)
2. 進入專案目錄:
   ```bash
   cd /home/kasm-user/Desktop/travel-budget
   ```
3. 確認環境變數已設定:
   ```bash
   cat .env.local
   # 應該要看到 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
4. 執行遷移腳本:
   ```bash
   npm run migrate:phase6
   ```

**預期輸出**:
```
🚀 Phase 6 數據遷移開始

==================================================

📋 開始為旅行生成 hash_code...

找到 X 個需要生成 hash_code 的旅行

✅ 旅行 "..." (ID: X) -> hash_code: xxxxxx
✅ 旅行 "..." (ID: X) -> hash_code: xxxxxx

📊 Hash Code 遷移完成:
   成功: X
   失敗: 0

==================================================

👑 開始設定旅行管理員...

✅ 旅行 "..." (ID: X) -> 管理員: user_id X

📊 管理員設定完成:
   成功: X
   失敗: 0

==================================================

✨ 遷移完成!
```

### 步驟 5: 驗證遷移結果 (3 分鐘)

1. 回到 Supabase Dashboard → **Table Editor**
2. 點擊 `trips` 表格
   - 確認每個旅行都有 `hash_code` 值 ✅
   - 每個 hash_code 都是 6-8 位的隨機字母數字組合
3. 點擊 `trip_members` 表格
   - 確認每個旅行至少有一個成員的 `role` 是 `'admin'` ✅
   - 其他成員的 `role` 是 `'member'` ✅

---

## ✅ 遷移完成檢查清單

完成後,請確認以下項目:

- [ ] Supabase 備份已建立
- [ ] `trips` 表格有 `hash_code` 欄位
- [ ] `trip_members` 表格有 `role` 欄位
- [ ] 所有旅行都有唯一的 `hash_code`
- [ ] 每個旅行都至少有一個管理員
- [ ] 遷移腳本無錯誤訊息

---

## 🧪 測試 API (選擇性,約 10 分鐘)

遷移完成後,可以測試新功能:

### 測試 1: 建立新旅行

1. 啟動開發伺服器:
   ```bash
   npm run dev
   ```
2. 瀏覽器開啟 `http://localhost:3000`
3. 登入後建立一個新旅行
4. 開啟 Supabase Table Editor 檢查:
   - 新旅行應該有 `hash_code` ✅
   - 你的帳號在 `trip_members` 中應該是 `'admin'` ✅

### 測試 2: 使用 hash_code 加入旅行

1. 複製任一旅行的 `hash_code` (從 Supabase Table Editor)
2. 使用另一個帳號登入
3. 在「加入旅行」輸入 hash_code
4. 確認可以成功加入 ✅

### 測試 3: 管理員功能 (如果前端已更新)

1. 以管理員身分登入
2. 進入旅行詳情頁
3. 確認可以看到:
   - hash_code 顯示 ✅
   - 刪除旅行按鈕 ✅
   - 移除成員按鈕 ✅

---

## 🐛 疑難排解

### 問題 1: 遷移腳本無法執行

**錯誤**: `Module not found`

**解決方法**:
```bash
# 確認已安裝 @supabase/supabase-js
npm install

# 確認 package.json 有 "type": "module"
cat package.json | grep '"type"'
```

### 問題 2: 環境變數未設定

**錯誤**: `請設定 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數`

**解決方法**:
```bash
# 檢查 .env.local 是否存在
ls -la .env.local

# 如果不存在,從範例複製
cp .env.example .env.local

# 編輯並填入 Supabase 金鑰
nano .env.local
```

### 問題 3: Hash code 碰撞

**錯誤**: `Unable to generate unique hash code`

**解決方法**:
1. 這表示連續 20 次都產生重複的 hash code (機率極低)
2. 檢查 `trips` 表格的 `hash_code` 欄位
3. 刪除重複或異常的值
4. 重新執行遷移腳本

### 問題 4: 部分旅行沒有管理員

**檢查方法**:
```sql
-- 在 Supabase SQL Editor 執行
SELECT t.id, t.name, COUNT(tm.id) as admin_count
FROM trips t
LEFT JOIN trip_members tm ON t.id = tm.trip_id AND tm.role = 'admin'
GROUP BY t.id, t.name
HAVING COUNT(tm.id) = 0;
```

**解決方法**:
```sql
-- 將旅行的第一個成員設為管理員 (替換 TRIP_ID)
UPDATE trip_members
SET role = 'admin'
WHERE id = (
  SELECT id FROM trip_members
  WHERE trip_id = TRIP_ID
  ORDER BY joined_at ASC
  LIMIT 1
);
```

---

## 📱 前端更新 (選擇性)

如果想立即看到 hash_code 分享功能,可以快速更新前端:

### 最小修改 (5 分鐘)

只需在旅行詳情頁顯示 hash_code:

**檔案**: `app/trips/[id]/page.tsx`

找到這段:
```tsx
<Chip label={`旅行 ID: ${trip.id}`} size="small" />
```

改為:
```tsx
<Chip
  label={`旅行 ID: ${trip.hash_code || trip.id}`}
  size="small"
  onClick={() => {
    navigator.clipboard.writeText(trip.hash_code || trip.id.toString());
    alert('ID 已複製!');
  }}
/>
```

並更新 interface:
```tsx
interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  hash_code?: string;  // 新增這行
}
```

這樣就可以點擊複製 hash_code 了!

---

## 🚀 部署到 Vercel (選擇性)

如果想將更新部署到線上:

```bash
# 1. Commit 所有變更
git add .
git commit -m "feat(phase6): add admin role and hash_code sharing"

# 2. Push 到 GitHub
git push origin master

# 3. Vercel 會自動部署
# 或手動觸發: vercel --prod
```

**注意**: Vercel 環境變數應該已經設定好 Supabase 金鑰

---

## 📚 相關文件

- [PHASE6_PLAN.md](./PHASE6_PLAN.md) - 完整開發計劃
- [PHASE6_MIGRATION_GUIDE.md](./PHASE6_MIGRATION_GUIDE.md) - 詳細遷移指南
- [PHASE6_STEP1-2_SUMMARY.md](./PHASE6_STEP1-2_SUMMARY.md) - Step 1-2 總結
- [PHASE6_STEP3-5_SUMMARY.md](./PHASE6_STEP3-5_SUMMARY.md) - Step 3-5 總結

---

## 🎉 完成!

恭喜!完成 Phase 6 後,你的應用現在擁有:

✅ **管理員系統** - 旅行創建者可以管理成員和刪除旅行
✅ **Hash Code 分享** - 簡單的 6-8 位 ID 方便分享
✅ **權限控制** - 完善的後端權限驗證系統
✅ **安全性提升** - 防止隨意猜測 ID 加入旅行

下一步你可以:
- 繼續完善前端 UI
- 添加 QR Code 分享功能
- 實現多管理員支援
- 添加成員邀請審核機制

需要協助請參考相關文件或開 issue! 🚀
