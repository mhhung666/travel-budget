# Travel Budget v2.0 大重構計畫

## 重構目標

1. **統一程式碼風格** - ESLint + Prettier
2. **物件化與元件重用** - 拆分大型元件、建立共用元件庫
3. **方便擴充功能** - Custom Hooks、API 服務層、型別安全
4. **程式碼移至 src/** - 標準化專案結構
5. **完善 i18n** - 移除硬編碼字串
6. **整理文件** - 清理過時文件

---

## Phase 1: 基礎設施 (程式碼風格 & 目錄結構)

### 1.1 新增 ESLint + Prettier 配置 ✅

**新增檔案:**
- `.eslintrc.js` - ESLint 配置
- `.prettierrc` - Prettier 配置
- `.prettierignore` - Prettier 忽略檔案

**更新 package.json:**
- 新增 `lint:fix`, `format`, `format:check` scripts
- 新增開發依賴: eslint, prettier, eslint-config-prettier

### 1.2 建立 src/ 目錄結構

**目標結構:**
```
src/
├── app/                    # Next.js App Router
├── components/             # 共用元件
│   ├── common/             # 通用元件 (ConfirmDialog, LoadingState, etc.)
│   ├── expense/            # 支出相關 (ExpenseCard, ExpenseForm, etc.)
│   ├── member/             # 成員相關 (MemberCard, MemberList)
│   ├── trip/               # 旅行相關 (TripCard, ShareCode)
│   └── layout/             # 佈局元件 (Navbar)
├── hooks/                  # Custom Hooks
├── services/               # API 服務層
├── lib/                    # 工具函數
├── types/                  # 型別定義
├── constants/              # 常數
├── i18n/                   # 國際化
│   ├── config.ts
│   └── messages/
└── styles/                 # 共用樣式
```

### 1.3 更新配置檔案

**tsconfig.json:**
- 更新 `paths` 別名指向 `./src/*`
- 更新 `include` 為 `src/**/*.ts`, `src/**/*.tsx`

**next.config.ts:**
- 更新 i18n 插件路徑為 `./src/i18n/config.ts`

---

## Phase 2: 建立共用基礎設施

### 2.1 建立 Custom Hooks

| Hook | 功能 | 檔案 |
|------|------|------|
| `useAuth` | 認證狀態管理 | `src/hooks/useAuth.ts` |
| `useSnackbar` | 通知管理 | `src/hooks/useSnackbar.ts` |
| `useDialog` | Dialog 狀態管理 | `src/hooks/useDialog.ts` |
| `useAsyncAction` | 非同步操作封裝 | `src/hooks/useAsyncAction.ts` |

### 2.2 建立 API 服務層

| Service | 功能 | 檔案 |
|---------|------|------|
| `api` | 基礎 API client | `src/services/api.ts` |
| `authService` | 認證相關 API | `src/services/auth.service.ts` |
| `tripService` | 旅行相關 API | `src/services/trip.service.ts` |
| `expenseService` | 支出相關 API | `src/services/expense.service.ts` |
| `memberService` | 成員相關 API | `src/services/member.service.ts` |

### 2.3 建立常數檔案

| 檔案 | 內容 |
|------|------|
| `src/constants/currencies.ts` | 幣別定義 (使用 i18n key) |
| `src/constants/routes.ts` | 路由常數 |

---

## Phase 3: 元件拆分與重用

### 3.1 拆分 trips/[id]/page.tsx

**現況:** 1160 行的巨型元件

**目標結構:**
```
src/app/[locale]/trips/[id]/
├── page.tsx              # 主頁面 (~100 行)
├── _components/          # 頁面專用元件
│   ├── TripHeader.tsx    # 旅行資訊卡片
│   ├── ExpenseSection.tsx # 支出區塊
│   ├── MemberSection.tsx  # 成員區塊
│   └── DangerZone.tsx     # 刪除旅行
```

### 3.2 共用元件

```
src/components/
├── common/
│   ├── ConfirmDialog.tsx      # 確認對話框
│   ├── LoadingState.tsx       # 載入狀態
│   ├── ErrorState.tsx         # 錯誤狀態
│   └── PageHeader.tsx         # 頁面標題
├── expense/
│   ├── ExpenseCard.tsx        # 支出卡片
│   ├── ExpenseForm.tsx        # 支出表單 (新增/編輯共用)
│   └── ExpenseList.tsx        # 支出列表
├── member/
│   ├── MemberCard.tsx         # 成員卡片
│   └── MemberList.tsx         # 成員列表
└── trip/
    ├── TripCard.tsx           # 旅行卡片
    └── ShareCode.tsx          # 分享代碼元件
```

---

## Phase 4: 完善 i18n 國際化

### 4.1 新增翻譯 key

**需要新增的 section:**
- `expense.*` - 支出相關
- `member.*` - 成員相關
- `settlement.*` - 結算相關
- `currency.*` - 幣別名稱
- `error.*` - 錯誤訊息
- `action.*` - 操作回饋

### 4.2 移除硬編碼字串

**主要檔案:**
- `app/[locale]/trips/[id]/page.tsx` - 大量硬編碼
- `app/[locale]/trips/[id]/settlement/page.tsx` - 部分硬編碼
- `types/index.ts` - 幣別名稱硬編碼

---

## Phase 5: 整理文件

### 5.1 保留的文件

```
docs/
├── README.md            # 專案介紹
├── SETUP.md             # 環境設定
├── ARCHITECTURE.md      # 架構說明
├── API.md               # API 文件
└── REFACTOR_V2.md       # 本文件
```

### 5.2 刪除/歸檔的文件

```
# 合併到 README.md
- QUICKSTART.md

# 合併到 docs/SETUP.md
- SUPABASE_SETUP.md

# 刪除 (已過時)
- PHASE6_COMPLETION_REPORT.md
- docs/PHASE7_DEPLOYMENT_REQUIRED.md

# 歸檔 (壓縮或刪除)
- docs/archive/ 下所有 PHASE 文件
```

---

## Phase 6: 測試框架設定

### 6.1 Vitest + React Testing Library

**新增檔案:**
- `vitest.config.ts`
- `vitest.setup.ts`
- `src/__tests__/` 目錄

**新增 scripts:**
- `test` - 執行測試
- `test:run` - 單次執行
- `test:coverage` - 覆蓋率報告

---

## 執行進度

| Phase | 任務 | 狀態 |
|-------|------|------|
| 1.1 | ESLint + Prettier 配置 | ✅ 完成 |
| 1.2-1.3 | 建立 src/ 並移動檔案 | ✅ 完成 |
| 2.1 | 建立 Custom Hooks | ✅ 完成 |
| 2.2 | 建立 API 服務層 | ✅ 完成 |
| 2.3 | 建立常數檔案 | ✅ 完成 |
| 3 | 元件拆分 | ✅ 完成 |
| 4 | 完善 i18n | ✅ 完成 |
| 5 | 整理文件 | ✅ 完成 |
| 6 | Vitest 測試框架 | ✅ 完成 |

---

## 驗證清單

### 每個 Phase 完成後:
- [ ] `npm run lint` 無錯誤
- [ ] `npm run build` 建置成功
- [ ] `npm run dev` 手動測試功能

### 最終驗證:
- [ ] 所有頁面路由正常
- [ ] 語言切換 (中/英) 正常
- [ ] 主題切換 (亮/暗) 正常
- [ ] CRUD 操作正常 (旅行、支出、成員)
- [ ] 結算功能正常

---

## 注意事項

1. **向後相容**: 不改變 API 端點和資料結構
2. **漸進式重構**: 每個 Phase 完成後確保系統可運行
3. **Git 分支**: 在 `refactor/2.0` 分支進行
4. **測試優先**: 大改動前確保功能正常

---

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| v2.0.0 | 2026-01-20 | 開始大重構 |
