# Phase 6 Step 3-5 完成總結

## ✅ 已完成的後端功能 (Step 3-4)

### Step 3: 管理員權限檢查

**新增檔案**: [lib/permissions.ts](lib/permissions.ts)

提供完整的權限檢查函數:
- `isAdmin(userId, tripId)` - 檢查是否為管理員
- `isMember(userId, tripId)` - 檢查是否為成員
- `getUserRole(userId, tripId)` - 取得用戶角色
- `getTripId(tripId)` - 支援 hash_code 轉換為數字 ID
- `getTripHashCode(tripId)` - 取得旅行的 hash_code
- `requireAdmin(userId, tripId)` - API 用權限驗證
- `requireMember(userId, tripId)` - API 用成員驗證

### Step 4: API 路由更新

#### 4.1 建立旅行 API (已更新)
**檔案**: [app/api/trips/route.ts](app/api/trips/route.ts)

變更:
- ✅ 建立旅行時自動生成唯一的 `hash_code`
- ✅ 創建者自動設為管理員 (`role: 'admin'`)
- ✅ GET 返回包含 `hash_code` 欄位

#### 4.2 刪除旅行 API (新增)
**檔案**: [app/api/trips/[id]/route.ts](app/api/trips/[id]/route.ts)

新增功能:
- ✅ `DELETE /api/trips/{id}` - 刪除旅行 (僅管理員)
- ✅ 支援 hash_code 或數字 ID
- ✅ 自動驗證管理員權限
- ✅ CASCADE 刪除所有相關資料

#### 4.3 移除成員 API (新增)
**檔案**: [app/api/trips/[id]/members/[userId]/route.ts](app/api/trips/[id]/members/[userId]/route.ts)

新增功能:
- ✅ `DELETE /api/trips/{id}/members/{userId}` - 移除成員 (僅管理員)
- ✅ 防止管理員移除自己
- ✅ 保留被移除成員的支出記錄
- ✅ 檢查成員是否有支出並給予警告

#### 4.4 成員列表 API (已更新)
**檔案**: [app/api/trips/[id]/members/route.ts](app/api/trips/[id]/members/route.ts)

變更:
- ✅ 支援 hash_code
- ✅ 返回包含 `role` 欄位 (admin/member)

#### 4.5 旅行詳情 API (已更新)
**檔案**: [app/api/trips/[id]/route.ts](app/api/trips/[id]/route.ts)

變更:
- ✅ 支援 hash_code
- ✅ 返回包含 `hash_code` 欄位

#### 4.6 支出相關 API (已更新)
**檔案**: [app/api/trips/[id]/expenses/route.ts](app/api/trips/[id]/expenses/route.ts)

變更:
- ✅ GET 和 POST 都支援 hash_code

#### 4.7 結算 API (已更新)
**檔案**: [app/api/trips/[id]/settlement/route.ts](app/api/trips/[id]/settlement/route.ts)

變更:
- ✅ 支援 hash_code

#### 4.8 加入旅行 API (已更新)
**檔案**: [app/api/trips/join/route.ts](app/api/trips/join/route.ts)

變更:
- ✅ 支援 hash_code 或數字 ID
- ✅ 加入時自動設為一般成員 (`role: 'member'`)
- ✅ 返回旅行資訊包含 hash_code

---

## 📊 API 功能總覽

### 管理員專屬 API
```
DELETE /api/trips/{id}                      - 刪除旅行
DELETE /api/trips/{id}/members/{userId}     - 移除成員
```

### 支援 hash_code 的 API
```
所有 /api/trips/{id}/* 路由現在都支援使用 hash_code 或數字 ID
```

### 新增的資料欄位
```
trips:
  - hash_code (TEXT, UNIQUE) - 短 hash code (例如: a7x9k2)

trip_members:
  - role (TEXT) - 角色 ('admin' 或 'member')
```

---

## 🎯 Step 5: 前端更新 (尚未完成)

由於前端代碼較為複雜且篇幅較長,前端的更新需要:

### 5.1 需要更新的頁面

1. **旅行詳情頁面** (`app/trips/[id]/page.tsx`)
   - [ ] 新增分享 hash_code 區塊
   - [ ] 新增「複製 ID」按鈕
   - [ ] 顯示管理員徽章
   - [ ] 新增「刪除旅行」按鈕 (僅管理員可見)
   - [ ] 新增「移除成員」按鈕 (僅管理員可見)

2. **旅行列表頁面** (`app/trips/page.tsx`)
   - [ ] 使用 hash_code 作為連結

3. **加入旅行頁面** (需確認現有流程)
   - [ ] 更新輸入欄位說明支援 hash_code

4. **新增快速加入頁面** (`app/join/[hashCode]/page.tsx`)
   - [ ] 創建新頁面支援透過連結快速加入

### 5.2 前端實現建議

由於時間關係,以下是關鍵的前端更新範例:

#### 分享 ID 區塊 (旅行詳情頁)

```typescript
// 在旅行資訊卡片中新增
interface Trip {
  id: number;
  name: string;
  hash_code: string;  // 新增
  // ...
}

interface Member {
  id: number;
  username: string;
  display_name: string;
  role: string;  // 新增: 'admin' 或 'member'
  // ...
}

// 檢查當前用戶是否為管理員
const isAdmin = members.find(m => m.id === currentUser?.id)?.role === 'admin';

// 複製 hash_code 功能
const copyHashCode = () => {
  navigator.clipboard.writeText(trip.hash_code);
  // 顯示複製成功提示
};

// 刪除旅行功能 (僅管理員)
const deleteTrip = async () => {
  if (!confirm('確定要刪除整個旅行嗎?這將刪除所有支出記錄!')) return;

  const response = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
  if (response.ok) {
    router.push('/trips');
  }
};

// 移除成員功能 (僅管理員)
const removeMember = async (userId: number) => {
  if (!confirm('確定要移除此成員嗎?')) return;

  const response = await fetch(`/api/trips/${tripId}/members/${userId}`, { method: 'DELETE' });
  if (response.ok) {
    await loadTripData();
  }
};
```

#### UI 元件範例

```tsx
// 分享區塊
<Card>
  <CardContent>
    <Typography variant="subtitle2">分享旅行</Typography>
    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
      <Chip
        label={`旅行 ID: ${trip.hash_code}`}
        onClick={copyHashCode}
        icon={<ContentCopy />}
      />
    </Box>
    <Typography variant="caption" color="text.secondary">
      點擊複製 ID 並分享給其他人
    </Typography>
  </CardContent>
</Card>

// 成員列表 (顯示角色和移除按鈕)
{members.map((member) => (
  <Box key={member.id}>
    <Avatar>{member.display_name.charAt(0)}</Avatar>
    <Box>
      <Typography>{member.display_name}</Typography>
      {member.role === 'admin' && <Chip label="管理員" size="small" />}
    </Box>
    {isAdmin && member.id !== currentUser?.id && (
      <IconButton onClick={() => removeMember(member.id)}>
        <PersonRemove />
      </IconButton>
    )}
  </Box>
))}

// 刪除旅行按鈕 (僅管理員)
{isAdmin && (
  <Button
    color="error"
    startIcon={<Delete />}
    onClick={deleteTrip}
  >
    刪除旅行
  </Button>
)}
```

---

## 🔧 測試建議

### 後端 API 測試 (可使用 curl 或 Postman)

1. **測試 hash_code 生成**:
   ```bash
   # 建立新旅行,檢查是否有 hash_code
   curl -X POST http://localhost:3000/api/trips \
     -H "Content-Type: application/json" \
     -d '{"name": "測試旅行"}'
   ```

2. **測試管理員權限**:
   ```bash
   # 嘗試刪除旅行 (需要 cookie)
   curl -X DELETE http://localhost:3000/api/trips/{hash_code}
   ```

3. **測試 hash_code 加入**:
   ```bash
   # 使用 hash_code 加入旅行
   curl -X POST http://localhost:3000/api/trips/join \
     -H "Content-Type: application/json" \
     -d '{"trip_id": "a7x9k2"}'
   ```

---

## 📝 前端實現提示

由於前端代碼較長,建議分階段實現:

### 階段 1: 基本顯示 (最小可行)
1. 在旅行詳情頁顯示 hash_code
2. 添加複製按鈕
3. 顯示成員角色徽章

### 階段 2: 管理功能
1. 添加刪除旅行按鈕 (僅管理員可見)
2. 添加移除成員按鈕 (僅管理員可見)
3. 添加確認對話框

### 階段 3: 優化體驗
1. 創建快速加入頁面 `/join/[hashCode]`
2. 優化分享 UI
3. 添加複製成功提示

---

## 🚀 下一步執行順序

1. **晚上執行數據庫遷移** (必須):
   - Step 1: 在 Supabase 執行 Schema 更新
   - Step 2: 執行 `npm run migrate:phase6`

2. **前端更新** (選擇性,可逐步實現):
   - 優先更新旅行詳情頁顯示 hash_code
   - 實現複製功能
   - 實現管理員功能

3. **測試**:
   - 建立新旅行檢查 hash_code
   - 測試管理員刪除功能
   - 測試移除成員功能
   - 測試使用 hash_code 加入旅行

---

## 📂 所有新增/修改的檔案

### 新增檔案
- `lib/hashcode.ts` - Hash code 工具函數
- `lib/permissions.ts` - 權限檢查函數
- `app/api/trips/[id]/members/[userId]/route.ts` - 移除成員 API
- `scripts/phase6-schema-update.sql` - Schema 更新 SQL
- `scripts/migrate-phase6.js` - 數據遷移腳本
- `PHASE6_MIGRATION_GUIDE.md` - 遷移指南
- `PHASE6_STEP1-2_SUMMARY.md` - Step 1-2 總結
- `PHASE6_STEP3-5_SUMMARY.md` - 本文件

### 修改檔案
- `package.json` - 新增 migrate:phase6 script
- `app/api/trips/route.ts` - 建立旅行生成 hash_code,設定管理員
- `app/api/trips/[id]/route.ts` - 新增 DELETE,支援 hash_code
- `app/api/trips/[id]/members/route.ts` - 支援 hash_code,返回 role
- `app/api/trips/[id]/expenses/route.ts` - 支援 hash_code
- `app/api/trips/[id]/settlement/route.ts` - 支援 hash_code
- `app/api/trips/join/route.ts` - 支援 hash_code,設定 role

---

## ⚠️ 重要提醒

1. **數據庫遷移是必須的**: 所有 API 變更都依賴新的 Schema
2. **向後兼容**: 所有 API 同時支援 hash_code 和數字 ID
3. **權限驗證**: 管理員操作都在後端驗證,前端隱藏只是 UX 優化
4. **前端可選**: 即使前端不更新,API 已經可以使用 (例如透過 API 工具測試)

---

## 💡 快速啟動建議

如果時間有限,建議優先:
1. **必做**: 執行數據庫遷移 (Step 1-2)
2. **快速**: 在旅行詳情頁添加顯示 hash_code 和複製按鈕
3. **進階**: 實現管理員功能 UI

這樣可以先把基本的分享功能上線,管理員功能可以之後慢慢完善!
