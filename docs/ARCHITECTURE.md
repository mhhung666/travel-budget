# 專案架構說明

## 目錄結構

```
travel-budget/
├── src/                        # 源碼目錄
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/           # 國際化路由
│   │   │   ├── page.tsx        # 首頁
│   │   │   ├── login/          # 登入頁
│   │   │   ├── trips/          # 旅行相關頁面
│   │   │   ├── settings/       # 設定頁
│   │   │   └── join/           # 加入旅行頁
│   │   ├── api/                # API 路由
│   │   │   ├── auth/           # 認證 API
│   │   │   └── trips/          # 旅行相關 API
│   │   ├── globals.css         # 全域樣式
│   │   └── layout.tsx          # 根佈局
│   │
│   ├── components/             # 共用元件
│   │   ├── common/             # 通用元件 (ConfirmDialog, LoadingState, etc.)
│   │   ├── expense/            # 支出相關元件
│   │   ├── member/             # 成員相關元件
│   │   ├── trip/               # 旅行相關元件
│   │   └── layout/             # 佈局元件 (Navbar, LanguageSwitcher)
│   │
│   ├── hooks/                  # Custom Hooks
│   │   ├── useAuth.ts          # 認證狀態管理
│   │   ├── useSnackbar.ts      # 通知管理
│   │   ├── useDialog.ts        # Dialog 狀態管理
│   │   └── useAsyncAction.ts   # 非同步操作
│   │
│   ├── services/               # API 服務層
│   │   ├── api.ts              # 基礎 API client
│   │   ├── auth.service.ts     # 認證服務
│   │   ├── trip.service.ts     # 旅行服務
│   │   ├── expense.service.ts  # 支出服務
│   │   ├── member.service.ts   # 成員服務
│   │   └── settlement.service.ts # 結算服務
│   │
│   ├── lib/                    # 工具函數
│   │   ├── auth.ts             # JWT 認證邏輯
│   │   ├── supabase.ts         # Supabase 客戶端
│   │   ├── permissions.ts      # 權限檢查
│   │   ├── settlement.ts       # 結算演算法
│   │   └── hashcode.ts         # Hash code 生成
│   │
│   ├── types/                  # TypeScript 型別定義
│   │   └── index.ts
│   │
│   ├── constants/              # 常數定義
│   │   ├── currencies.ts       # 幣別定義
│   │   └── routes.ts           # 路由常數
│   │
│   └── i18n/                   # 國際化
│       ├── config.ts           # i18n 配置
│       └── messages/           # 翻譯檔案
│           ├── en.json
│           └── zh.json
│
├── docs/                       # 文件
├── public/                     # 靜態資源
├── middleware.ts               # Next.js Middleware
├── next.config.ts              # Next.js 配置
├── tsconfig.json               # TypeScript 配置
└── package.json
```

---

## 技術棧

| 類別 | 技術 |
|------|------|
| 前端框架 | React 19 + Next.js 16 (App Router) |
| UI 框架 | Material-UI (MUI) 7 |
| 樣式 | Emotion (CSS-in-JS) |
| 語言 | TypeScript 5.9 |
| 資料庫 | Supabase (PostgreSQL) |
| 認證 | JWT (jose) + bcryptjs |
| 國際化 | next-intl |
| 部署 | Vercel |
| 測試 | Vitest + React Testing Library |
| 代碼品質 | ESLint + Prettier |

---

## 核心功能

### 1. 認證系統

- 使用 JWT 進行無狀態認證
- Cookie-based session
- 密碼使用 bcrypt 加密

### 2. 旅行管理

- 建立/編輯/刪除旅行
- 使用 hash code 邀請成員
- 管理員權限系統

### 3. 支出管理

- 多幣別支援 (TWD, JPY, USD, EUR, HKD)
- 自動匯率換算
- 彈性分帳 (選擇分帳對象)

### 4. 結算系統

- 貪心演算法計算最少轉帳次數
- 清楚顯示誰欠誰多少錢

---

## 資料流

```
User Action
    ↓
React Component (src/app/[locale]/*)
    ↓
Custom Hook (src/hooks/*)
    ↓
Service Layer (src/services/*)
    ↓
API Route (src/app/api/*)
    ↓
Permission Check (src/lib/permissions.ts)
    ↓
Supabase (src/lib/supabase.ts)
    ↓
Database
```

---

## API 路由

### 認證

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/register` | 註冊 |
| POST | `/api/auth/login` | 登入 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 取得當前用戶 |
| PUT | `/api/auth/update` | 更新資料 |

### 旅行

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/trips` | 列出所有旅行 |
| POST | `/api/trips` | 建立旅行 |
| GET | `/api/trips/[id]` | 取得旅行詳情 |
| PUT | `/api/trips/[id]` | 更新旅行 |
| DELETE | `/api/trips/[id]` | 刪除旅行 |
| POST | `/api/trips/join` | 加入旅行 |

### 支出

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/trips/[id]/expenses` | 列出支出 |
| POST | `/api/trips/[id]/expenses` | 新增支出 |
| PUT | `/api/trips/[id]/expenses/[expenseId]` | 更新支出 |
| DELETE | `/api/trips/[id]/expenses/[expenseId]` | 刪除支出 |

### 成員

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/trips/[id]/members` | 列出成員 |
| DELETE | `/api/trips/[id]/members/[userId]` | 移除成員 |

### 結算

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/trips/[id]/settlement` | 取得結算資料 |

---

## 國際化

支援語言:
- `zh` - 繁體中文 (預設)
- `en` - English

翻譯檔案位置: `src/i18n/messages/`

使用方式:
```tsx
import { useTranslations } from 'next-intl';

function Component() {
  const t = useTranslations('common');
  return <button>{t('save')}</button>;
}
```

---

## 主題系統

支援淺色/深色主題，使用 MUI 的 ThemeProvider。

主題定義: `src/app/[locale]/theme.ts`

切換主題:
```tsx
import { useThemeContext } from '@/app/[locale]/context/ThemeContext';

function Component() {
  const { mode, toggleTheme } = useThemeContext();
  return <button onClick={toggleTheme}>{mode}</button>;
}
```
