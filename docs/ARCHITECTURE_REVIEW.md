# Travel Budget 專案架構分析與改善建議

> 分析日期: 2026-02-07  
> 專案版本: v3.4.3  
> 分析者: AI Assistant

---

## 📊 專案概覽

### 基本資訊
- **專案類型**: 多人旅行記帳與分帳應用
- **技術棧**: Next.js 16 (App Router) + React 19 + TypeScript + Supabase
- **UI 框架**: Shadcn UI (Radix UI) + Tailwind CSS
- **部署平台**: Vercel
- **資料庫**: Supabase (PostgreSQL)

### 專案規模
- **程式碼行數**: ~167 個檔案 (src 目錄)
- **元件數量**: 60+ 個 React 元件
- **測試覆蓋率**: 基礎測試框架已建立 (Vitest)

---

## 🏗️ 架構分析

### 1. 整體架構 ✅ **良好**

專案採用現代化的 **Server Actions 架構**，已經完成從傳統 API Routes 到 Server Actions 的遷移：

```
用戶操作 (UI)
    ↓
React Component (Client Component)
    ↓
Server Actions (src/actions/*.ts)
    ↓
權限檢查 (src/lib/permissions.ts)
    ↓
Supabase Client (src/lib/supabase.ts)
    ↓
PostgreSQL Database
```

**優點**:
- ✅ 使用 Next.js 16 最新的 Server Actions 模式
- ✅ 減少了不必要的 API 層級，提升效能
- ✅ 端到端型別安全 (TypeScript)
- ✅ 清晰的關注點分離 (Separation of Concerns)

### 2. 目錄結構 ✅ **優秀**

```
src/
├── actions/              # Server Actions (業務邏輯層) ⭐
│   ├── auth.actions.ts
│   ├── trip.actions.ts
│   ├── expense.actions.ts
│   ├── member.actions.ts
│   ├── settlement.actions.ts
│   ├── stats.actions.ts
│   └── itinerary.actions.ts
│
├── app/                  # Next.js App Router
│   ├── [locale]/         # 國際化路由
│   └── api/              # 僅保留必要的 API (exchange-rates, public)
│
├── components/           # React 元件 (功能導向分組) ⭐
│   ├── common/          # 通用元件
│   ├── expenses/        # 支出相關
│   ├── trips/           # 旅行相關
│   ├── settlement/      # 結算相關
│   ├── stats/           # 統計圖表
│   ├── member/          # 成員管理
│   ├── layout/          # 佈局元件
│   └── ui/              # Shadcn UI 基礎元件
│
├── hooks/               # Custom Hooks
├── lib/                 # 工具函數與核心邏輯
├── types/               # TypeScript 型別定義
├── constants/           # 常數定義
└── i18n/                # 國際化配置
```

**優點**:
- ✅ 功能導向分組 (Feature-based grouping)
- ✅ 清晰的層級劃分
- ✅ 元件重用性高

### 3. 資料流與狀態管理 ✅ **簡潔高效**

- **Server State**: 使用 Server Actions + `revalidatePath` 管理
- **Client State**: React Hooks (`useState`, `useEffect`)
- **表單驗證**: Zod Schema (src/lib/validation.ts)
- **通知系統**: Custom `useToast` hook

**優點**:
- ✅ 避免過度工程化 (不需要 Redux/Zustand)
- ✅ 利用 Next.js 內建的快取機制
- ✅ 表單驗證集中管理

---

## 🎯 核心功能架構

### 1. 認證系統 ✅

- **實作方式**: 自訂 JWT (jose) + Cookie-based Session
- **密碼加密**: bcryptjs
- **Session 管理**: `src/lib/auth.ts`

**優點**:
- ✅ 無狀態認證
- ✅ 安全的密碼處理

**改善空間**:
- ⚠️ 考慮使用 Supabase Auth 簡化認證流程

### 2. 權限系統 ✅

- **實作位置**: `src/lib/permissions.ts`
- **權限層級**: Admin / Member
- **檢查時機**: Server Actions 執行前

**優點**:
- ✅ 集中化權限檢查
- ✅ 支援 Trip ID 或 Hash Code 查詢

### 3. 多幣別與匯率 ✅

- **支援幣別**: TWD, JPY, USD, EUR, HKD, CNY, KRW, THB, SGD, MYR
- **匯率來源**: ExchangeRate-API
- **換算邏輯**: 自動轉換為基準貨幣 (TWD)

**優點**:
- ✅ 即時匯率更新
- ✅ 支援多種亞洲常用貨幣

### 4. 結算演算法 ⭐ **優秀**

- **實作位置**: `src/lib/settlement.ts`
- **演算法**: 貪心演算法 (Greedy Algorithm)
- **目標**: 最小化轉帳次數

**優點**:
- ✅ 高效的債務結算
- ✅ 清晰的程式碼註解
- ✅ 處理浮點數精度問題

### 5. 統計與視覺化 ✅

- **圖表庫**: Recharts
- **統計維度**: 
  - 按類別統計
  - 按成員統計
  - 按日期統計
  - 按地區統計

**優點**:
- ✅ 豐富的數據視覺化
- ✅ 響應式圖表設計

### 6. 國際化 (i18n) ✅

- **框架**: next-intl
- **支援語言**: 繁體中文 (zh-TW) / English (en)
- **翻譯檔案**: `src/i18n/messages/`

**優點**:
- ✅ 完整的多語系支援
- ✅ 型別安全的翻譯 key

---

## ✅ 已完成的重構項目

根據 `REFACTOR_V2.md` 和 `IMPROVEMENTS.md`，以下項目已完成：

1. ✅ **移除 SQLite 依賴** - 已統一使用 Supabase
2. ✅ **建立 Server Actions** - 已完全遷移
3. ✅ **元件拆分** - 大型元件已拆分為小元件
4. ✅ **ESLint + Prettier** - 程式碼風格統一
5. ✅ **測試框架** - Vitest + React Testing Library
6. ✅ **完善 i18n** - 移除硬編碼字串
7. ✅ **目錄結構優化** - 功能導向分組

---

## 🔍 需要改善的地方

### 1. 測試覆蓋率 ⚠️ **中等優先級**

**現況**:
- 僅有 1 個範例測試檔案 (`sample.test.ts`)
- 核心業務邏輯缺乏測試

**建議**:
```bash
# 需要新增的測試
src/__tests__/
├── lib/
│   ├── settlement.test.ts      # 結算演算法測試 (重要!)
│   ├── permissions.test.ts     # 權限檢查測試
│   └── hashcode.test.ts        # Hash code 生成測試
├── actions/
│   ├── trip.actions.test.ts    # 旅行操作測試
│   └── expense.actions.test.ts # 支出操作測試
└── components/
    └── (關鍵元件的單元測試)
```

**優先測試項目**:
1. 🔴 **結算演算法** (`settlement.ts`) - 核心功能
2. 🟡 權限檢查邏輯
3. 🟡 Server Actions 的邊界條件

### 2. 錯誤處理與日誌 ⚠️ **中等優先級**

**現況**:
- 錯誤處理分散在各個元件
- 缺乏統一的錯誤日誌系統

**建議**:
```typescript
// src/lib/logger.ts
export const logger = {
  error: (context: string, error: unknown) => {
    console.error(`[${context}]`, error);
    // 可整合 Sentry 或其他錯誤追蹤服務
  },
  info: (context: string, message: string) => {
    console.log(`[${context}]`, message);
  }
};

// src/lib/error-handler.ts
export function handleServerError(error: unknown): ActionResult {
  if (error instanceof ZodError) {
    return { success: false, error: '資料驗證失敗' };
  }
  logger.error('ServerAction', error);
  return { success: false, error: '系統錯誤，請稍後再試' };
}
```

### 3. 效能優化 🟢 **低優先級**

**建議**:
- 使用 `React.memo` 優化列表渲染 (TripList, ExpenseList)
- 考慮使用 `useMemo` 快取計算結果 (統計數據)
- 圖片優化 (使用 Next.js Image 元件)

### 4. 安全性強化 🟡 **中等優先級**

**建議啟用 Supabase RLS (Row Level Security)**:

```sql
-- 範例: Trip 資料表的 RLS 政策
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view trips they are members of"
ON trips FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = trips.id
    AND trip_members.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can update their trips"
ON trips FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM trip_members
    WHERE trip_members.trip_id = trips.id
    AND trip_members.user_id = auth.uid()
    AND trip_members.role = 'admin'
  )
);
```

**優點**:
- 資料庫層級的安全保護
- 即使程式碼有漏洞，資料仍受保護
- 減少後端權限檢查程式碼

### 5. 型別安全性 🟢 **低優先級**

**現況**:
- 部分地方使用 `any` 型別 (如 `user` state)

**建議**:
```typescript
// 移除 any
const [user, setUser] = useState<User | null>(null);

// 定義更嚴格的型別
type Locale = 'en' | 'zh-TW';
```

### 6. 文件完整性 🟢 **低優先級**

**建議新增**:
- API 文件 (Server Actions 的參數與回傳值)
- 元件使用範例 (Storybook?)
- 貢獻指南 (CONTRIBUTING.md)

---

## 🚀 建議新增的有趣功能

### 1. 🎯 **智慧分帳建議** (高價值)

**功能描述**:
- 根據歷史消費習慣，自動建議分帳對象
- 例如: "餐飲類消費通常由 A, B, C 分攤"

**技術實作**:
```typescript
// src/lib/smart-split.ts
export function suggestSplitMembers(
  category: string,
  tripId: number,
  expenses: Expense[]
): number[] {
  // 分析過去同類別的分帳記錄
  const historicalSplits = expenses
    .filter(e => e.category === category)
    .flatMap(e => e.splits.map(s => s.userId));
  
  // 計算出現頻率
  const frequency = new Map<number, number>();
  historicalSplits.forEach(userId => {
    frequency.set(userId, (frequency.get(userId) || 0) + 1);
  });
  
  // 回傳最常分攤的成員
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([userId]) => userId);
}
```

**UI 設計**:
- 在新增支出時顯示 "建議分帳對象" 標籤
- 一鍵套用建議

### 2. 📸 **收據 OCR 掃描** (高價值)

**功能描述**:
- 拍照上傳收據，自動辨識金額、日期、商家
- 減少手動輸入時間

**技術選擇**:
- Google Cloud Vision API
- Tesseract.js (開源方案)
- Azure Computer Vision

**實作流程**:
```
用戶上傳收據照片
    ↓
呼叫 OCR API
    ↓
解析結果 (金額、日期、商家)
    ↓
自動填入表單
    ↓
用戶確認後儲存
```

### 3. 💰 **預算警示系統** (中等價值)

**功能描述**:
- 設定旅行總預算或每日預算
- 超支時發送通知
- 顯示預算使用進度條

**資料表設計**:
```sql
CREATE TABLE trip_budgets (
  id SERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id),
  total_budget DECIMAL(10,2),
  daily_budget DECIMAL(10,2),
  alert_threshold DECIMAL(3,2) DEFAULT 0.8, -- 80% 時警示
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**UI 元件**:
```tsx
<BudgetProgress 
  spent={totalSpent} 
  budget={tripBudget} 
  showAlert={spent > budget * 0.8}
/>
```

### 4. 🗺️ **地圖視覺化** (中等價值)

**功能描述**:
- 在地圖上標記消費地點
- 視覺化旅行路線
- 整合 Google Maps / Mapbox

**實作**:
```tsx
import { MapContainer, Marker, Popup } from 'react-leaflet';

<MapContainer center={[25.033, 121.565]} zoom={13}>
  {expenses.map(expense => (
    <Marker 
      key={expense.id} 
      position={expense.location}
    >
      <Popup>
        {expense.description} - ${expense.amount}
      </Popup>
    </Marker>
  ))}
</MapContainer>
```

### 5. 📊 **匯出報表功能** (中等價值)

**功能描述**:
- 匯出 PDF / Excel 格式的旅行報表
- 包含支出明細、統計圖表、結算方案

**技術選擇**:
- PDF: `jsPDF` + `html2canvas`
- Excel: `xlsx` library

**報表內容**:
- 旅行基本資訊
- 支出明細表
- 統計圖表 (截圖)
- 結算方案
- 成員消費排行

### 6. 🔔 **即時通知系統** (低價值，但有趣)

**功能描述**:
- 新增支出時通知所有成員
- 結算完成時通知
- 使用 Web Push Notification

**技術實作**:
- Supabase Realtime Subscriptions
- Web Push API
- Firebase Cloud Messaging (FCM)

### 7. 🎮 **遊戲化元素** (低價值，但有趣)

**功能描述**:
- 成就系統: "首次出國"、"消費達人"、"省錢高手"
- 排行榜: 最會記帳的成員
- 徽章收集

**範例成就**:
```typescript
const achievements = [
  {
    id: 'first_trip',
    name: '首次旅行',
    description: '建立第一個旅行',
    icon: '🎉'
  },
  {
    id: 'expense_master',
    name: '記帳達人',
    description: '記錄超過 100 筆支出',
    icon: '📝'
  },
  {
    id: 'budget_keeper',
    name: '預算守護者',
    description: '完成一次旅行且不超支',
    icon: '💰'
  }
];
```

### 8. 🤖 **AI 支出分類** (高價值)

**功能描述**:
- 根據支出描述自動分類
- 例如: "星巴克咖啡" → 自動分類為 "餐飲"

**技術實作**:
```typescript
// 使用簡單的關鍵字匹配
const categoryKeywords = {
  food: ['餐廳', '咖啡', '早餐', '午餐', '晚餐', 'restaurant'],
  transportation: ['計程車', 'Uber', '地鐵', '公車', 'taxi'],
  accommodation: ['飯店', 'hotel', 'airbnb', '民宿'],
  shopping: ['購物', '商場', 'mall', 'shopping'],
};

// 或使用 OpenAI API 進行智慧分類
async function classifyExpense(description: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{
      role: "user",
      content: `將以下消費分類: "${description}"`
    }]
  });
  return response.choices[0].message.content;
}
```

---

## 🎯 功能優先級建議

### 高優先級 (立即實作)
1. 🔴 **測試覆蓋率提升** - 確保系統穩定性
2. 🔴 **智慧分帳建議** - 大幅提升使用體驗
3. 🟡 **Supabase RLS** - 強化安全性

### 中優先級 (3-6 個月)
4. 🟡 **收據 OCR 掃描** - 差異化功能
5. 🟡 **預算警示系統** - 實用功能
6. 🟡 **匯出報表** - 商業價值高

### 低優先級 (有空再做)
7. 🟢 **地圖視覺化** - 錦上添花
8. 🟢 **即時通知** - 技術挑戰
9. 🟢 **遊戲化元素** - 趣味性

---

## 📈 效能基準測試建議

建議使用 Lighthouse 進行效能測試:

```bash
# 安裝 Lighthouse CLI
npm install -g lighthouse

# 執行測試
lighthouse https://your-app.vercel.app --view
```

**目標指標**:
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 90
- SEO: > 90

---

## 🔧 技術債務清單

1. ⚠️ ESLint 配置問題 (執行 `npm run lint` 時出現路徑錯誤)
2. 🟢 部分元件使用 `any` 型別
3. 🟢 缺乏 API 文件

---

## 📝 總結

### 整體評價: ⭐⭐⭐⭐ (4/5)

**優點**:
- ✅ 現代化的技術棧
- ✅ 清晰的架構設計
- ✅ 良好的程式碼組織
- ✅ 完整的功能實作
- ✅ 優秀的 UI/UX 設計

**待改進**:
- ⚠️ 測試覆蓋率不足
- ⚠️ 缺乏錯誤監控
- ⚠️ 安全性可強化 (RLS)

### 下一步行動建議

1. **立即執行** (本週):
   - 修復 ESLint 配置問題
   - 新增結算演算法測試
   - 啟用 Supabase RLS

2. **短期目標** (本月):
   - 實作智慧分帳建議
   - 提升測試覆蓋率至 60%
   - 新增錯誤監控 (Sentry)

3. **中期目標** (3 個月):
   - 實作收據 OCR 功能
   - 新增預算警示系統
   - 完善 API 文件

---

**報告結束** 🎉
