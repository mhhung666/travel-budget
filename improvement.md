# Travel Budget - 架構改善建議

## 目錄

- [P0 - 重大問題（應優先修復）](#p0---重大問題應優先修復)
- [P1 - 架構改善（提升維護性）](#p1---架構改善提升維護性)
- [P2 - 擴充性改善（為未來功能鋪路）](#p2---擴充性改善為未來功能鋪路)
- [P3 - 開發體驗優化](#p3---開發體驗優化)

---

## P0 - 重大問題（應優先修復）

### 1. Supabase Client 重複建立

**問題：** `supabase` client 在 `src/lib/supabase.ts` 和 `src/lib/permissions.ts` 中各自獨立建立了一個實例，違反單一來源原則。

```typescript
// src/lib/supabase.ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// src/lib/permissions.ts — 又建了一個
const supabase = createClient(supabaseUrl, supabaseKey);
```

**修復：** `permissions.ts` 應從 `@/lib/supabase` import 共用的 client。

---

### 2. 使用 Anon Key 直接操作資料庫（安全風險）

**問題：** 所有 Server Actions 都使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`（公開暴露在前端）來操作資料庫。雖然有自訂的 JWT 認證，但 Supabase 端如果沒有設好 RLS（Row Level Security），任何人都能用 anon key 直接呼叫 Supabase API 讀寫資料。

**建議：**
- 在 Server Actions 中使用 `SUPABASE_SERVICE_ROLE_KEY`（不帶 `NEXT_PUBLIC_` 前綴，不暴露給前端）
- 或確保 Supabase 端已啟用並正確設置 RLS 政策

---

### 3. N+1 查詢問題

**問題：** `getExpenses()` 在取得費用清單後，對每筆費用逐一查詢 splits，造成 N+1 查詢。

```typescript
// src/actions/expense.actions.ts:79-129
const expensesWithSplits = await Promise.all(
  expenses.map(async (expense) => {
    const { data: splits } = await supabase       // 每筆 expense 一次查詢
      .from('expense_splits')
      .select(...)
      .eq('expense_id', expense.id);
    ...
  })
);
```

**修復：** 一次取出所有相關 splits，再在記憶體中 join：

```typescript
const expenseIds = expenses.map(e => e.id);
const { data: allSplits } = await supabase
  .from('expense_splits')
  .select(`user_id, share_amount, expense_id, users!expense_splits_user_id_fkey(username, display_name)`)
  .in('expense_id', expenseIds);

// 記憶體中分組
const splitsByExpense = groupBy(allSplits, 'expense_id');
```

---

### 4. 頁面資料載入邏輯大量重複

**問題：** 每個頁面（trip detail、itinerary、settlement）都重複了幾乎相同的模式：

1. 檢查登入 → 已登入用 Server Action / 未登入用 Public API
2. 處理 FORBIDDEN → fallback 到 Public API
3. loading / error / data 三態管理

`page.tsx`、`itinerary/page.tsx` 中的 `loadData()` 和 `loadPublicData()` 幾乎是 copy-paste。

**建議：** 抽取 custom hook：

```typescript
// src/hooks/useTripData.ts
function useTripData<T>(tripId: string, options: {
  serverAction: (id: string) => Promise<ActionResult<T>>;
  publicEndpoint: string;
}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  // ... 統一邏輯
  return { data, loading, error, currentUser, reload };
}
```

---

## P1 - 架構改善（提升維護性）

### 5. `any` 類型濫用

**問題：** 多處使用 `any` 類型，喪失 TypeScript 的保護：

```typescript
// src/app/[locale]/trips/[id]/page.tsx:52
const [currentUser, setCurrentUser] = useState<any>(null);

// src/app/[locale]/trips/[id]/page.tsx:133
const handleAddExpense = async (data: any) => { ... }
```

**建議：** 為所有 handler 的 `data` 參數定義明確型別，`currentUser` 使用 `User | null`。

---

### 6. Server Action 的 Auth Boilerplate 重複

**問題：** 每個 Server Action 開頭都有相同的認證檢查：

```typescript
const session = await getSession();
if (!session) {
  return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
}
```

出現在 `trip.actions.ts`、`expense.actions.ts`、`member.actions.ts`... 每個 function 都要寫一次。

**建議：** 建立 higher-order function：

```typescript
// src/actions/withAuth.ts
function withAuth<TArgs extends any[], TResult>(
  fn: (session: Session, ...args: TArgs) => Promise<ActionResult<TResult>>
) {
  return async (...args: TArgs): Promise<ActionResult<TResult>> => {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '未登入', code: 'UNAUTHORIZED' };
    }
    return fn(session, ...args);
  };
}

// 使用
export const getTrips = withAuth(async (session) => {
  // 不需要再檢查 session
});
```

---

### 7. 錯誤訊息語言不一致

**問題：** Server Action 的錯誤訊息使用硬編碼的中文字串（`'未登入'`、`'旅行不存在'`），但前端已有 i18n 系統支援四種語言。

**建議：** Server Action 回傳 error code（已有 `code` 欄位），前端根據 code 對應 i18n 訊息。不要在 Server Action 中寫死中文。

```typescript
// Server Action
return { success: false, code: 'UNAUTHORIZED' };

// Client
const errorMessage = t(`error.${result.code}`);
```

---

### 8. 頁面元件過度承擔邏輯

**問題：** `trips/[id]/page.tsx` 單一頁面元件承擔了：
- 資料載入（loadTripData、loadPublicTripData）
- 6 個 state 管理（trip、members、expenses、currentUser、loading、error）
- 4 個 dialog 狀態
- 4 個 handler（handleAddExpense、handleEditExpense、handleDeleteExpense、handleEditTrip）
- 權限判斷
- UI 渲染

**建議：** 使用 container / presentational 模式拆分：

```
TripDetailPage (container)
  ├── useTripData(tripId)        → 資料 + loading + error
  ├── useTripDialogs()           → dialog 開關邏輯
  ├── useTripPermissions(user, members) → 權限判斷
  └── TripDetailView (presentational)   → 純 UI
```

---

### 9. SQL Schema 不應嵌入程式碼

**問題：** 資料庫 schema 以字串形式存在 `src/lib/supabase.ts` 的 `INIT_SQL` 常數中，無法版控 migration、無法追蹤變更歷史。

**建議：**
- 使用 `supabase/migrations/` 目錄管理 migration 檔案
- 或使用 Supabase CLI 的 `supabase db diff` 功能
- 移除 `INIT_SQL` 常數

---

## P2 - 擴充性改善（為未來功能鋪路）

### 10. 引入 Client-Side Cache / Data Fetching Library

**問題：** 目前每次路由切換或操作後都 `await loadData()` 重新載入全部資料，沒有 cache、沒有 optimistic update、沒有 stale-while-revalidate。

**建議：** 引入 **TanStack Query (React Query)** 或 **SWR**：

```typescript
const { data: trip, isLoading, mutate } = useQuery({
  queryKey: ['trip', tripId],
  queryFn: () => getTrip(tripId),
});
```

帶來的好處：
- 自動 cache + 背景重新驗證
- Optimistic update（操作後立即更新 UI，不等 API 回應）
- 避免同一資料重複請求
- 內建 loading / error / retry 管理

---

### 11. API Route 權限缺失

**問題：** `src/app/api/public/` 下的所有 API route 完全沒有認證和權限檢查。雖然名稱叫 "public"，但這表示任何人只要知道 trip ID 就能讀取所有資料（費用、成員、結算）。

**建議：**
- 評估是否真的需要公開存取。如果是分享功能，可以只允許透過 `hash_code` 存取（不接受數字 ID）
- 敏感資料（如費用明細、結算）考慮需要認證才能讀取
- 至少加上 rate limiting 防止爬蟲

---

### 12. 元件目錄結構優化

**目前結構問題：** domain components 分散在 `components/trips/detail/dialogs/`、`components/expenses/`、`components/member/` 等不同地方，但它們其實都在 trip detail 頁面使用。

**建議：** 考慮依功能模組（feature module）重組：

```
src/
├── features/
│   ├── trip/
│   │   ├── components/   (TripCard, TripList, TripHeader...)
│   │   ├── hooks/        (useTripData, useTripPermissions)
│   │   ├── actions/      (trip.actions.ts)
│   │   └── types/        (trip.ts)
│   ├── expense/
│   │   ├── components/   (ExpenseCard, ExpenseForm...)
│   │   ├── actions/      (expense.actions.ts)
│   │   └── types/        (expense.ts)
│   ├── settlement/
│   ├── itinerary/
│   └── auth/
├── components/ui/        (Shadcn 基礎元件，保持不動)
├── components/common/    (共用元件)
└── app/                  (路由，只做 layout + 載入 feature 元件)
```

好處：每個 feature 自包含、可獨立測試、減少跨目錄引用。

---

### 13. 缺少 Middleware 層

**問題：** Next.js 的 `middleware.ts` 未被使用。目前認證檢查散落在每個 page component 和 server action 中。

**建議：** 在 `src/middleware.ts` 集中處理：

```typescript
export function middleware(request: NextRequest) {
  const session = request.cookies.get('session');
  const isProtectedRoute = request.nextUrl.pathname.match(/\/(trips|settings|stats)/);

  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
```

---

### 14. 測試覆蓋率嚴重不足

**問題：** `src/__tests__/` 只有一個 `sample.test.ts`，核心業務邏輯（settlement 算法、expense 分帳、權限檢查）完全沒有測試。

**建議優先補上的測試：**

| 優先順序 | 目標 | 原因 |
|---------|------|------|
| 1 | `lib/settlement.ts` | 涉及金錢計算，錯誤影響大 |
| 2 | `actions/*.ts` | 核心業務邏輯 |
| 3 | `lib/permissions.ts` | 安全相關 |
| 4 | `lib/validation.ts` | 資料驗證邊界條件 |

---

## P3 - 開發體驗優化

### 15. 缺少 Loading Skeleton

**問題：** 目前所有頁面載入時顯示單一 `Loader2` spinner，使用者體驗較差。

**建議：** 改用 skeleton loading（骨架屏），讓使用者感知結構已就緒：

```tsx
if (loading) return <TripDetailSkeleton />;
```

---

### 16. 統一 Toast / 通知邏輯

**問題：** 部分 toast 使用中文硬編碼（如 `title: "Deleted"`、`title: "Error"`），與 i18n 系統不一致。刪除確認使用原生 `confirm()`，與其他操作使用的 Dialog 風格不統一。

**建議：**
- 所有 toast 訊息都走 i18n
- 將 `confirm()` 替換為 `ConfirmDialog` 元件

---

### 17. 環境變數管理

**問題：** `JWT_SECRET` 等安全敏感變數的驗證只在啟動時隱式發生。如果缺少變數，錯誤訊息不夠清晰。

**建議：** 建立 `src/lib/env.ts` 做啟動時驗證：

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  JWT_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```

---

## 改善路線圖建議

```
Phase 1 (立即)
  ├── 修復 Supabase client 重複建立 (#1)
  ├── 修復 N+1 查詢 (#3)
  └── 修復 any 類型 (#5)

Phase 2 (短期)
  ├── 抽取資料載入 hook (#4)
  ├── Server Action auth wrapper (#6)
  ├── 錯誤訊息改用 error code (#7)
  └── 補寫核心測試 (#14)

Phase 3 (中期)
  ├── 引入 React Query (#10)
  ├── 加入 Next.js Middleware (#13)
  ├── 評估 Public API 安全性 (#11)
  └── Schema migration 管理 (#9)

Phase 4 (長期)
  ├── Feature module 重組 (#12)
  ├── Loading skeleton (#15)
  ├── 統一通知系統 (#16)
  └── 環境變數驗證 (#17)
```

---

## 目前做得好的地方

在改善之餘，值得保留和延續的模式：

- **ActionResult\<T\> 統一回傳格式** — 所有 Server Action 回傳一致的結構，便於前端處理
- **Zod 驗證** — 所有使用者輸入都經過 schema 驗證，安全且可維護
- **元件與 Shadcn/UI 整合** — 基礎元件統一、風格一致、可替換
- **i18n 架構完善** — 四語言支援、翻譯鍵值分類清晰
- **虛擬成員系統** — 設計彈性，可支援未註冊使用者參與分帳
- **權限模型簡潔** — admin/member 兩級權限，符合使用情境
