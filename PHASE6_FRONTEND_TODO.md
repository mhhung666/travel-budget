# Phase 6 前端實現清單

## ✅ 後端狀態
- ✅ 所有 API 已完成並支援 hash_code
- ✅ 管理員權限驗證已實現
- ✅ 數據庫 Schema 已準備好 (待遷移)

---

## 🎨 前端 UI 需要實現的功能

### 優先級 P0 - 必須實現 (核心功能)

#### 1. 旅行詳情頁 - 分享功能
**檔案**: `app/trips/[id]/page.tsx`

**需要新增**:
- [ ] 顯示 hash_code (取代數字 ID)
- [ ] 「複製 ID」按鈕
- [ ] 複製成功提示 (Snackbar/Toast)

**實現要點**:
```typescript
// Interface 更新
interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  hash_code: string;  // 新增
}

// 複製功能
const copyHashCode = async () => {
  try {
    await navigator.clipboard.writeText(trip.hash_code);
    setSnackbar({ open: true, message: 'ID 已複製!' });
  } catch (err) {
    alert('複製失敗,請手動複製');
  }
};
```

**UI 設計**:
```tsx
<Card>
  <CardContent>
    <Typography variant="subtitle2" gutterBottom>
      分享此旅行
    </Typography>
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField
        value={trip.hash_code}
        size="small"
        InputProps={{ readOnly: true }}
        sx={{ flex: 1 }}
      />
      <Button
        variant="outlined"
        startIcon={<ContentCopy />}
        onClick={copyHashCode}
      >
        複製
      </Button>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
      分享此 ID 給朋友,他們就能加入旅行
    </Typography>
  </CardContent>
</Card>
```

---

#### 2. 旅行詳情頁 - 成員角色顯示
**檔案**: `app/trips/[id]/page.tsx`

**需要新增**:
- [ ] 成員 Interface 新增 `role` 欄位
- [ ] 顯示管理員徽章

**實現要點**:
```typescript
// Interface 更新
interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
  role: 'admin' | 'member';  // 新增
}

// 檢查當前用戶是否為管理員
const isCurrentUserAdmin = members.find(
  m => m.id === currentUser?.id
)?.role === 'admin';
```

**UI 設計**:
```tsx
{members.map((member) => (
  <Box key={member.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <Avatar>{member.display_name.charAt(0)}</Avatar>
    <Box sx={{ flex: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="body1" fontWeight={500}>
          {member.display_name}
        </Typography>
        {member.role === 'admin' && (
          <Chip
            label="管理員"
            size="small"
            color="primary"
            icon={<AdminPanelSettings />}
          />
        )}
      </Box>
      <Typography variant="body2" color="text.secondary">
        @{member.username}
      </Typography>
    </Box>
    {/* 移除按鈕放這裡 (下個功能) */}
  </Box>
))}
```

---

### 優先級 P1 - 重要功能 (管理員操作)

#### 3. 旅行詳情頁 - 刪除旅行按鈕
**檔案**: `app/trips/[id]/page.tsx`

**需要新增**:
- [ ] 「刪除旅行」按鈕 (僅管理員可見)
- [ ] 確認刪除對話框
- [ ] 刪除成功後導航到旅行列表

**實現要點**:
```typescript
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

const handleDeleteTrip = async () => {
  try {
    const response = await fetch(`/api/trips/${tripId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }

    // 刪除成功,返回列表
    router.push('/trips');
  } catch (err: any) {
    setError(err.message);
  }
};
```

**UI 設計**:
```tsx
{/* 危險操作區 - 僅管理員可見 */}
{isCurrentUserAdmin && (
  <Card sx={{ mt: 3, borderColor: 'error.main', borderWidth: 1 }}>
    <CardContent>
      <Typography variant="subtitle2" color="error" gutterBottom>
        危險操作
      </Typography>
      <Button
        variant="outlined"
        color="error"
        startIcon={<Delete />}
        fullWidth
        onClick={() => setDeleteDialogOpen(true)}
      >
        刪除此旅行
      </Button>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
        刪除後將無法恢復,包括所有支出記錄
      </Typography>
    </CardContent>
  </Card>
)}

{/* 確認刪除對話框 */}
<Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
  <DialogTitle>確認刪除旅行</DialogTitle>
  <DialogContent>
    <Alert severity="warning" sx={{ mb: 2 }}>
      此操作無法復原!
    </Alert>
    <Typography>
      確定要刪除「{trip.name}」嗎?
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      這將永久刪除:
    </Typography>
    <ul>
      <li>所有成員記錄</li>
      <li>所有支出記錄</li>
      <li>所有分帳資料</li>
    </ul>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setDeleteDialogOpen(false)}>
      取消
    </Button>
    <Button
      onClick={() => {
        setDeleteDialogOpen(false);
        handleDeleteTrip();
      }}
      color="error"
      variant="contained"
    >
      確認刪除
    </Button>
  </DialogActions>
</Dialog>
```

---

#### 4. 旅行詳情頁 - 移除成員按鈕
**檔案**: `app/trips/[id]/page.tsx`

**需要新增**:
- [ ] 成員列表中的「移除」按鈕 (僅管理員可見)
- [ ] 不能移除自己
- [ ] 確認移除對話框
- [ ] 移除成功後重新載入成員列表

**實現要點**:
```typescript
const [removeMemberDialog, setRemoveMemberDialog] = useState<{
  open: boolean;
  member: Member | null;
}>({ open: false, member: null });

const handleRemoveMember = async (userId: number) => {
  try {
    const response = await fetch(
      `/api/trips/${tripId}/members/${userId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error);
    }

    // 重新載入資料
    await loadTripData();
    setRemoveMemberDialog({ open: false, member: null });
  } catch (err: any) {
    setError(err.message);
  }
};
```

**UI 設計**:
```tsx
{members.map((member) => (
  <Box key={member.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <Avatar>{member.display_name.charAt(0)}</Avatar>
    <Box sx={{ flex: 1 }}>
      {/* ...成員資訊... */}
    </Box>

    {/* 移除按鈕 - 僅管理員且不是自己 */}
    {isCurrentUserAdmin && member.id !== currentUser?.id && (
      <IconButton
        size="small"
        color="error"
        onClick={() => setRemoveMemberDialog({ open: true, member })}
      >
        <PersonRemove />
      </IconButton>
    )}
  </Box>
))}

{/* 確認移除對話框 */}
<Dialog
  open={removeMemberDialog.open}
  onClose={() => setRemoveMemberDialog({ open: false, member: null })}
>
  <DialogTitle>移除成員</DialogTitle>
  <DialogContent>
    <Typography>
      確定要將「{removeMemberDialog.member?.display_name}」移出旅行嗎?
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      該成員的支出記錄將會保留
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setRemoveMemberDialog({ open: false, member: null })}>
      取消
    </Button>
    <Button
      onClick={() => handleRemoveMember(removeMemberDialog.member!.id)}
      color="error"
      variant="contained"
    >
      移除
    </Button>
  </DialogActions>
</Dialog>
```

---

#### 5. 加入旅行頁面 - 支援 hash_code
**檔案**: `app/trips/page.tsx` 或加入旅行的 Dialog

**需要新增**:
- [ ] 更新輸入欄位說明
- [ ] 支援輸入 hash_code 或數字 ID

**實現要點**:
```typescript
// 加入旅行功能已經支援 hash_code,只需更新 UI 說明

// 現有的 handleJoinTrip 函數應該已經可以用,只需更新提示文字
```

**UI 設計**:
```tsx
<TextField
  fullWidth
  label="旅行 ID"
  placeholder="輸入 6-8 位旅行代碼 (例如: a7x9k2)"
  value={joinTripId}
  onChange={(e) => setJoinTripId(e.target.value)}
  helperText="向旅行創建者索取旅行代碼"
/>
```

---

### 優先級 P2 - 優化功能 (可選)

#### 6. 旅行列表頁 - 顯示 hash_code
**檔案**: `app/trips/page.tsx`

**需要新增**:
- [ ] 在旅行卡片上顯示 hash_code
- [ ] 快速複製按鈕

**實現要點**:
```typescript
interface Trip {
  id: number;
  hash_code: string;  // 確保有這個欄位
  name: string;
  // ...
}
```

**UI 設計**:
```tsx
<Card>
  <CardContent>
    <Typography variant="h6">{trip.name}</Typography>
    <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
      <Chip
        label={`ID: ${trip.hash_code}`}
        size="small"
        onClick={() => {
          navigator.clipboard.writeText(trip.hash_code);
          // 顯示複製成功提示
        }}
        icon={<ContentCopy fontSize="small" />}
      />
    </Box>
  </CardContent>
</Card>
```

---

#### 7. 快速加入頁面 (新增)
**檔案**: `app/join/[hashCode]/page.tsx` (新檔案)

**需要新增**:
- [ ] 創建新頁面
- [ ] 顯示旅行資訊
- [ ] 一鍵加入按鈕
- [ ] 處理未登入情況

**實現要點**:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function QuickJoinPage() {
  const router = useRouter();
  const params = useParams();
  const hashCode = params.hashCode as string;

  const [trip, setTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkAuthAndLoadTrip();
  }, []);

  const checkAuthAndLoadTrip = async () => {
    // 檢查是否登入
    const authRes = await fetch('/api/auth/me');
    setIsLoggedIn(authRes.ok);

    if (!authRes.ok) {
      // 未登入,導向登入頁
      router.push(`/login?redirect=/join/${hashCode}`);
      return;
    }

    // 載入旅行資訊 (使用 hash_code)
    const tripRes = await fetch(`/api/trips/${hashCode}`);
    if (tripRes.ok) {
      const data = await tripRes.json();
      setTrip(data.trip);
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    const response = await fetch('/api/trips/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: hashCode }),
    });

    if (response.ok) {
      const data = await response.json();
      router.push(`/trips/${data.trip.hash_code}`);
    }
  };

  // ...UI 實現
}
```

**UI 設計**:
```tsx
<Container maxWidth="sm" sx={{ py: 8 }}>
  <Card>
    <CardContent sx={{ textAlign: 'center' }}>
      <Typography variant="h5" gutterBottom>
        加入旅行
      </Typography>
      {trip && (
        <>
          <Typography variant="h4" sx={{ my: 3 }}>
            {trip.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {trip.description}
          </Typography>
          <Button
            variant="contained"
            size="large"
            fullWidth
            sx={{ mt: 3 }}
            onClick={handleJoin}
          >
            加入此旅行
          </Button>
        </>
      )}
    </CardContent>
  </Card>
</Container>
```

---

#### 8. Snackbar/Toast 通知元件
**檔案**: `app/trips/[id]/page.tsx` 或共用元件

**需要新增**:
- [ ] 複製成功提示
- [ ] 操作成功提示
- [ ] 錯誤提示

**實現要點**:
```typescript
const [snackbar, setSnackbar] = useState({
  open: false,
  message: '',
  severity: 'success' as 'success' | 'error' | 'info',
});

const showSnackbar = (message: string, severity = 'success') => {
  setSnackbar({ open: true, message, severity });
};
```

**UI 設計**:
```tsx
<Snackbar
  open={snackbar.open}
  autoHideDuration={3000}
  onClose={() => setSnackbar({ ...snackbar, open: false })}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
>
  <Alert
    onClose={() => setSnackbar({ ...snackbar, open: false })}
    severity={snackbar.severity}
    sx={{ width: '100%' }}
  >
    {snackbar.message}
  </Alert>
</Snackbar>
```

---

## 📦 需要的 MUI Icons

確保已 import 這些 icons:

```typescript
import {
  ContentCopy,      // 複製 icon
  AdminPanelSettings, // 管理員 icon
  Delete,           // 刪除 icon
  PersonRemove,     // 移除成員 icon
  Share,            // 分享 icon (可選)
  Warning,          // 警告 icon
} from '@mui/icons-material';
```

---

## 🎯 實現優先順序建議

### 階段 1: 基本顯示 (1-2 小時)
1. ✅ 旅行詳情頁顯示 hash_code
2. ✅ 複製 ID 功能
3. ✅ 成員角色徽章

### 階段 2: 管理功能 (2-3 小時)
4. ✅ 刪除旅行功能
5. ✅ 移除成員功能
6. ✅ Snackbar 通知

### 階段 3: 優化體驗 (1-2 小時)
7. ✅ 旅行列表顯示 hash_code
8. ✅ 快速加入頁面
9. ✅ 加入旅行說明更新

---

## 📝 實現注意事項

### 1. 類型定義更新
所有涉及 Trip 和 Member 的 interface 都需要更新:

```typescript
// 旅行類型
interface Trip {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  hash_code: string;  // 新增
}

// 成員類型
interface Member {
  id: number;
  username: string;
  display_name: string;
  joined_at: string;
  role: 'admin' | 'member';  // 新增
}
```

### 2. 權限檢查
前端權限檢查只是 UX 優化,真正的權限驗證在後端:

```typescript
// 檢查是否為管理員 (僅用於 UI 顯示)
const isAdmin = members.find(m => m.id === currentUser?.id)?.role === 'admin';

// 即使前端繞過檢查,後端 API 也會拒絕非管理員的操作
```

### 3. 錯誤處理
所有管理員操作都要有適當的錯誤處理:

```typescript
try {
  const response = await fetch(...);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error);
  }
  // 成功處理
} catch (err: any) {
  setError(err.message);
  showSnackbar(err.message, 'error');
}
```

### 4. 載入狀態
重要操作要顯示載入狀態:

```typescript
const [isDeleting, setIsDeleting] = useState(false);

const handleDeleteTrip = async () => {
  setIsDeleting(true);
  try {
    // 刪除操作
  } finally {
    setIsDeleting(false);
  }
};

// UI
<Button disabled={isDeleting}>
  {isDeleting ? <CircularProgress size={20} /> : '刪除'}
</Button>
```

---

## ✅ 完成檢查清單

### 功能檢查
- [ ] 可以看到 hash_code
- [ ] 可以複製 hash_code
- [ ] 管理員看得到徽章
- [ ] 管理員可以刪除旅行
- [ ] 管理員可以移除成員
- [ ] 一般成員看不到管理功能
- [ ] 可以用 hash_code 加入旅行

### UI/UX 檢查
- [ ] 複製 ID 有成功提示
- [ ] 刪除旅行有確認對話框
- [ ] 移除成員有確認對話框
- [ ] 所有操作有載入狀態
- [ ] 錯誤訊息清楚易懂

### 測試檢查
- [ ] 管理員可以執行所有操作
- [ ] 一般成員無法看到管理按鈕
- [ ] 管理員無法移除自己
- [ ] 刪除旅行後正確導航
- [ ] 移除成員後列表更新

---

## 🚀 快速開始

選擇你想先實現的功能,參考上面的代碼範例直接加到對應的檔案中。

**推薦順序**:
1. 先做 P0 (分享功能) - 最重要且最簡單
2. 再做 P1 (管理功能) - 核心價值
3. 最後做 P2 (優化功能) - 錦上添花

需要協助時隨時詢問! 💪
