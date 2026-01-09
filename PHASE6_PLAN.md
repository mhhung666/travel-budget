# Phase 6: 管理員功能與旅行分享

## 功能概述

本階段將為旅行分帳 App 新增三大核心功能:
1. **管理員權限系統** - 旅行創建者成為管理員,可管理成員與旅行
2. **簡化 ID 系統** - 使用短 hash code 替代數字 ID,提升安全性
3. **旅行分享功能** - 透過分享 ID 讓其他人快速加入旅行

---

## 功能需求

### 1. 管理員權限系統

#### 1.1 數據庫變更
需要在 `trip_members` 表格新增 `role` 欄位:

```sql
-- 在 trip_members 表格新增角色欄位
ALTER TABLE trip_members ADD COLUMN role TEXT DEFAULT 'member';

-- 可能的角色值: 'admin', 'member'
-- admin: 旅行創建者,擁有管理權限
-- member: 一般成員
```

#### 1.2 管理員功能

**a) 刪除旅行**
- 只有管理員可以刪除整個旅行
- 刪除時會連帶刪除所有成員、支出、分帳記錄 (CASCADE)
- API Endpoint: `DELETE /api/trips/[id]`
- 需要驗證當前用戶是否為該旅行的管理員

**b) 移除成員**
- 只有管理員可以將其他成員移出旅行
- 管理員不能移除自己
- API Endpoint: `DELETE /api/trips/[id]/members/[userId]`
- 需要處理該成員相關的支出記錄:
  - 選項 1: 禁止移除有支出記錄的成員
  - 選項 2: 移除成員但保留支出記錄(推薦)

#### 1.3 UI 變更
- 旅行詳情頁需要顯示管理員標記
- 管理員可看到「刪除旅行」按鈕
- 管理員在成員列表中可看到「移除成員」按鈕
- 一般成員不顯示這些管理功能

---

### 2. 簡化 ID 系統 (Hash Code)

#### 2.1 目標
- 將數字 ID (如 `123`) 改為短 hash code (如 `a7x9k2`)
- 防止用戶透過猜測 ID 隨意加入其他旅行
- 保持 URL 簡短易讀

#### 2.2 實現方式

**選項 A: 保留數字 ID,新增 hash_code 欄位**
```sql
ALTER TABLE trips ADD COLUMN hash_code TEXT UNIQUE;
CREATE INDEX idx_trips_hash_code ON trips(hash_code);
```
- 優點: 不需要修改現有數據結構
- 缺點: 需要維護兩個 ID 欄位

**選項 B: 使用 UUID**
```sql
-- 修改 trips 表格使用 UUID
ALTER TABLE trips ALTER COLUMN id TYPE UUID;
```
- 優點: 標準做法,安全性高
- 缺點: UUID 較長 (如 `550e8400-e29b-41d4-a716-446655440000`)

**選項 C: 短 hash 生成函數 (推薦)**
```typescript
// 生成 6-8 位短 hash
function generateShortHash(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
```
- 優點: 簡短易分享
- 需要處理碰撞檢查

#### 2.3 需要修改的地方
- 數據庫 schema
- API 路由 (URL 參數改用 hash_code)
- 前端路由
- 加入旅行的邏輯

---

### 3. 旅行分享功能

#### 3.1 分享方式

**a) 複製分享 ID**
- 在旅行詳情頁顯示旅行 ID
- 提供「複製 ID」按鈕
- 點擊後複製 hash_code 到剪貼簿

**b) 分享連結 (進階)**
- 生成完整 URL: `https://your-app.vercel.app/join/{hash_code}`
- 提供「複製連結」按鈕
- 點擊連結後自動跳轉到加入旅行頁面

#### 3.2 加入旅行流程優化

**現有流程:**
1. 用戶手動輸入旅行 ID
2. 點擊加入

**新流程:**
1. 用戶收到 hash_code 或連結
2. 選項 A: 輸入 hash_code 加入
3. 選項 B: 點擊連結直接加入

**新增頁面 (選項 B):**
- `/join/[hash_code]` 頁面
- 自動檢查用戶是否登入
  - 已登入: 顯示旅行資訊,確認後加入
  - 未登入: 引導到登入頁,登入後自動加入

---

## 技術實現

### 數據庫 Schema 變更

```sql
-- 1. 新增管理員角色欄位
ALTER TABLE trip_members ADD COLUMN role TEXT DEFAULT 'member';

-- 2. 新增 hash_code 欄位
ALTER TABLE trips ADD COLUMN hash_code TEXT UNIQUE;
CREATE INDEX idx_trips_hash_code ON trips(hash_code);

-- 3. 為現有旅行生成 hash_code (遷移腳本)
-- 需要編寫腳本為現有資料生成唯一的 hash_code
```

### API 端點

#### 新增 API
```
DELETE /api/trips/[hash_code]              # 刪除旅行 (僅管理員)
DELETE /api/trips/[hash_code]/members/[userId]  # 移除成員 (僅管理員)
GET    /api/trips/by-hash/[hash_code]     # 透過 hash_code 獲取旅行資訊
POST   /api/trips/join/[hash_code]        # 透過 hash_code 加入旅行
```

#### 修改 API
```
GET /api/trips/[hash_code]                 # 改用 hash_code 而非數字 ID
PUT /api/trips/[hash_code]                 # 更新旅行
GET /api/trips/[hash_code]/expenses        # 獲取支出列表
POST /api/trips/[hash_code]/expenses       # 新增支出
GET /api/trips/[hash_code]/settlement      # 獲取結算
```

### 前端頁面

#### 新增頁面
```
/join/[hash_code]                          # 快速加入旅行頁面
```

#### 修改頁面
```
/trips/[hash_code]                         # 旅行詳情頁 (顯示分享功能)
/trips/[hash_code]/expenses                # 支出列表頁
/trips/[hash_code]/settlement              # 結算頁面
```

#### UI 元件
- 分享 ID 卡片 (顯示 hash_code + 複製按鈕)
- 管理員操作選單 (刪除旅行、移除成員)
- 成員列表 (顯示管理員徽章)

---

## 實現步驟

### Step 1: 數據庫 Schema 更新
1. 在 Supabase SQL Editor 執行 schema 變更
2. 編寫遷移腳本為現有旅行生成 hash_code
3. 為現有旅行創建者設定 role = 'admin'

### Step 2: 實現 Hash Code 生成
1. 在 `/lib` 創建 `hashcode.ts` 工具函數
2. 實現 hash_code 生成與碰撞檢查
3. 在建立旅行時自動生成 hash_code

### Step 3: 實現管理員權限檢查
1. 在 `/lib` 創建 `permissions.ts` 權限檢查函數
2. 實現 `isAdmin(userId, tripId)` 檢查
3. 在需要的 API 中加入權限驗證

### Step 4: 更新 API 路由
1. 修改現有 API 路由支援 hash_code
2. 新增刪除旅行 API
3. 新增移除成員 API
4. 新增透過 hash_code 加入旅行 API

### Step 5: 更新前端路由與 UI
1. 修改旅行相關頁面路由為 hash_code
2. 實現分享 ID 功能 UI
3. 實現管理員操作 UI
4. 新增快速加入頁面

### Step 6: 測試
1. 測試管理員刪除旅行
2. 測試管理員移除成員
3. 測試透過 hash_code 加入旅行
4. 測試權限驗證 (非管理員無法執行管理操作)

---

## 安全性考量

### 1. 權限驗證
- 所有管理員操作必須在後端驗證
- 不能只依賴前端隱藏按鈕

### 2. Hash Code 碰撞
- 生成 hash_code 時檢查是否已存在
- 如果碰撞,重新生成

### 3. 防止 ID 猜測
- hash_code 使用隨機生成
- 不使用可預測的規則 (如時間戳)

---

## UI/UX 設計建議

### 旅行詳情頁

```
┌─────────────────────────────────────┐
│ [← 返回] 日本旅行 2024              │
│                                      │
│ 📋 旅行 ID: a7x9k2  [📋 複製]       │
│                                      │
│ 👥 成員 (4人)                        │
│ • Alice (管理員) 👑                  │
│ • Bob              [移除] (僅管理員) │
│ • Carol            [移除] (僅管理員) │
│                                      │
│ 💰 支出列表                          │
│ ...                                  │
│                                      │
│ [🗑️ 刪除旅行] (僅管理員可見)        │
└─────────────────────────────────────┘
```

### 快速加入頁面

```
┌─────────────────────────────────────┐
│ 加入旅行                             │
│                                      │
│ 📋 日本旅行 2024                     │
│                                      │
│ 創建者: Alice                        │
│ 當前成員: 3 人                       │
│                                      │
│ [確認加入]  [取消]                   │
└─────────────────────────────────────┘
```

---

## 可選功能 (未來擴展)

1. **QR Code 分享**
   - 生成旅行 QR Code
   - 掃描後直接加入

2. **多管理員支援**
   - 允許設定多個管理員
   - 轉移管理員權限

3. **成員權限細分**
   - 查看權限
   - 編輯權限
   - 結算權限

4. **加入旅行邀請審核**
   - 管理員需要批准新成員加入
   - 防止不相關的人加入

---

## 時間估算

- Step 1-2: 數據庫與 Hash Code (1-2 小時)
- Step 3-4: API 實現 (2-3 小時)
- Step 5: 前端實現 (3-4 小時)
- Step 6: 測試與修復 (1-2 小時)

**總計**: 約 7-11 小時開發時間

---

## 注意事項

1. **向後兼容性**: 如果已有用戶使用數字 ID,需要保留向後兼容
2. **遷移策略**: 為現有旅行生成 hash_code 的遷移腳本要謹慎測試
3. **用戶體驗**: 分享功能要簡單直觀,複製 ID 要有視覺反饋
4. **錯誤處理**: 加入不存在的旅行、權限不足等錯誤要有友善提示
