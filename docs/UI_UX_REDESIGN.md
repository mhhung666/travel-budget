# UI/UX 評估與前端重新設計提案

> 撰寫日期:2026-07-02
> 範圍:整個前端(頁面結構、導覽、元件系統、視覺設計、PWA 體驗)
> 結論先講:功能面已經很完整,但前端是「功能逐一疊加」長出來的 —— 沒有共用的 App Shell、沒有品牌設計語言、行動端仍是「桌機版縮小」而非 PWA 原生體驗。建議以「**App Shell + 底部導覽 + 行程分頁化 + 設計 Token 化**」四件事為主軸重構,可分四個階段落地,不需要一次全部重寫。

---

## 目錄

1. [現況評估:發現的問題](#1-現況評估)
2. [重新設計:目標與設計原則](#2-設計原則)
3. [新資訊架構與導覽設計](#3-新資訊架構)
4. [設計系統(色彩/字級/元件)](#4-設計系統)
5. [關鍵頁面重新設計](#5-關鍵頁面重新設計)
6. [PWA 體驗深化](#6-pwa-體驗深化)
7. [實施路線圖](#7-實施路線圖)
8. [驗收指標](#8-驗收指標)

---

## 1. 現況評估

以下每一項都附上程式碼佐證,嚴重度標記:🔴 重大(直接影響易用性)/🟠 中等(不一致、增加維護成本)/🟡 輕微。

### 1.1 🔴 沒有 App Shell:每一頁都自己重組整個版面

Next.js App Router 的 layout 機制完全沒有被利用 —— [layout.tsx](../src/app/layout.tsx) 只放 Provider,結果:

- **19 個頁面各自** render `<Navbar user={...} />`、各自把 `currentUser` 映射成 props(欄位還不一致:[trips/page.tsx:84-96](../src/app/trips/page.tsx#L84-L96) 沒帶 `display_name`,[trips/[id]/page.tsx:92-106](../src/app/trips/%5Bid%5D/page.tsx#L92-L106) 有帶,且把 `display_name` 塞進 `username`)。
- **19 個檔案各自寫** `container mx-auto ... pt-24`,`pt-24` 是配合 fixed navbar 的魔術數字,改 navbar 高度要改 19 個地方。
- **9 個頁面各自手刻**「← 返回」按鈕與錯誤畫面(`<AlertTitle>Error</AlertTitle>` 的 "Error" 是硬編碼英文,未 i18n,出現在 [trips/[id]/page.tsx:77](../src/app/trips/%5Bid%5D/page.tsx#L77)、[settlement/page.tsx:167](../src/app/trips/%5Bid%5D/settlement/page.tsx#L167) 等多頁)。
- 換頁時 Navbar 整個 unmount/remount,通知鈴鐺、使用者選單都重新載入 —— 這正是 PWA「App-like」體驗的反面。

**共用元件已經存在卻沒人用**:[PageHeader](../src/components/common/PageHeader.tsx)、`LoadingState`、`ErrorState` 在 `components/common/` 裡定義完整、附範例註解,但全專案 **0 處使用**。

### 1.2 🔴 導覽模型混亂:桌機邏輯硬塞進手機

- 手機上的全域導覽是右上角漢堡 → DropdownMenu([Navbar.tsx:112-148](../src/components/layout/Navbar.tsx#L112-L148))。對一個以「旅途中隨手記帳」為核心場景的 PWA,把最常用的入口藏進兩層選單,是最大的互動成本錯置。**行動端記帳 App 的業界標準是底部分頁列(Bottom Tab Bar)+ 浮動新增按鈕(FAB)**,本專案兩者皆無。
- Navbar 標題語意不定:有時是 App 名、有時是頁名、有時是行程名([trips/[id]/page.tsx:105](../src/app/trips/%5Bid%5D/page.tsx#L105) `title={trip.name}`),使用者無法建立「這個位置代表什麼」的心智模型。
- **行程詳情頁是 hub-and-spoke 的極端案例**:進到一個行程後,「行程規劃 / 結算 / 統計 / 清單」是側欄四顆按鈕、「預算 / 活動紀錄 / 設定」又是右上三顆按鈕([trips/[id]/page.tsx:110-190](../src/app/trips/%5Bid%5D/page.tsx#L110-L190)),共 **7 個並列入口、兩個視覺群組、每顆按鈕一個任意色系**(primary/green/violet/amber/rose)。每個子頁都是獨立 route、獨立返回鍵,使用者在「行程」這個核心物件裡不停跳進跳出。

### 1.3 🟠 元件系統:重複實作與死程式碼

| 問題 | 證據 |
|---|---|
| **兩套支出卡片** | [ExpenseCard.tsx](../src/components/expenses/ExpenseCard.tsx) 是一套完整實作,但全專案沒有頁面引用它;實際使用的是 [TripExpenses.tsx:371-522](../src/components/trips/detail/TripExpenses.tsx#L371-L522) 內嵌的另一套卡片。兩套視覺不同,且 ExpenseCard 裡有**硬編碼英文**(`Split with (...)`、`title="Edit"`)。 |
| **巨型元件** | [ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx) 701 行、[settings/page.tsx](../src/app/settings/page.tsx) 588 行(個人資料+改密碼+改信箱+通知+推播裝置全部平鋪一頁)、[TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) 544 行(工具列+篩選面板+卡片+留言+分頁全部內嵌)。 |
| **主內容被包進 Collapsible** | 支出列表(頁面的主要內容)整個包在可收合的 Card 裡([TripExpenses.tsx:148](../src/components/trips/detail/TripExpenses.tsx#L148)),成員列表同樣。收合「頁面唯一的主內容」沒有意義,只增加一次誤觸風險。 |
| **Toast 回饋不一致** | 成功訊息有 3 處硬編碼 `className: 'bg-green-500 text-white border-green-600'`([trips/page.tsx:50](../src/app/trips/page.tsx#L50) 等),其他頁的成功 toast 用預設樣式 —— 同一個「成功」在不同頁長得不一樣。 |

### 1.4 🟠 視覺設計:沒有品牌,色彩使用任意

- [globals.css](../src/app/globals.css) 是 **shadcn 預設 zinc 灰階原封不動**:`--primary` 是近黑色。一個旅行主題的產品,主行動按鈕是黑色、整體無任何品牌色彩與情感。
- 但同時,元件層有 **28 處硬編碼的 Tailwind 調色盤顏色**(`text-rose-600`、`text-violet-600`、`text-amber-600`…),這些顏色不在 design token 內、不隨深色模式調整、彼此之間沒有語意規則(為什麼「活動紀錄」是 rose?「結算」是 green?)。結果是「Token 太素、實際用色太雜」的雙重失控。
- 深色模式的 `theme_color`([layout.tsx:36](../src/app/layout.tsx#L36) `#0f172a`,slate)與 CSS token 的深色背景(`240 10% 3.9%`,zinc)**不是同一個顏色**,PWA 狀態列會與 App 內容有色差。

### 1.5 🔴 PWA:有離線能力,但沒有 PWA 的「殼」

離線架構(Serwist + Query 持久化 + 離線新增支出)做得扎實,但**安裝後的體驗**缺了外皮:

- [manifest.ts](../src/app/manifest.ts):名稱是英文 "Travel Budget App"(產品明明叫「旅行記帳」)、`theme_color: '#fff'` 固定白色(深色模式下狀態列刺眼)、**沒有 `shortcuts`**(長按圖示快速「新增支出」是記帳 PWA 最有價值的捷徑)、沒有 `screenshots`(Android 安裝提示只會是簡陋小橫幅)。
- **全站沒有任何 `safe-area-inset` 處理**(grep 為 0)。standalone 模式下,iPhone 的動態島/Home Indicator 會直接壓在 fixed navbar 與頁面底部內容上。
- 手勢與觸控:支出卡的編輯/刪除是 32px 的小 icon button 貼在一起([TripExpenses.tsx:453-469](../src/components/trips/detail/TripExpenses.tsx#L453-L469)),低於 44px 觸控準則;行動端沒有滑動手勢、沒有下拉刷新。
- 長表單(新增支出,701 行的 Dialog)在手機上是 `max-h-[90vh] overflow-y-auto` 的置中彈窗 —— 手機鍵盤一彈出可視區所剩無幾。行動端應改用全螢幕 Sheet。

### 1.6 🟡 其他

- 貨幣符號 `NT$` 與基準幣別 TWD 在支出卡片內硬編碼([TripExpenses.tsx:439](../src/components/trips/detail/TripExpenses.tsx#L439)),未走 `formatCurrency`。
- 空狀態品質不一:行程列表有 `EmptyTripsState` 插畫級空狀態,支出/結算/清單只有兩行灰字。
- `Day N` 標籤硬編碼英文([TripExpenses.tsx:413](../src/components/trips/detail/TripExpenses.tsx#L413))。

---

## 2. 設計原則

重新設計圍繞四條原則,之後所有 UI 決策都回到這裡檢驗:

1. **Mobile-first、PWA-native**:核心場景是「旅途中單手、可能離線、快速記一筆」。導覽用拇指構得到的底部分頁列;最高頻動作(記帳)是永遠在場的 FAB;表單在行動端全螢幕。
2. **行程是「空間」,不是「頁面」**:進入一個行程 = 進入一個工作空間,支出/行程/結算/統計是空間內的分頁切換,不是跳走再跳回。
3. **一種模式只有一種長相**:一套支出卡片、一套頁首、一套成功/失敗回饋、一套空狀態。所有顏色來自 token,禁止元件內出現調色盤色名。
4. **殼永遠不動**:Navbar/TabBar 由 layout 渲染一次,換頁只換內容區。這同時解決一致性、效能與 PWA 質感三件事。

---

## 3. 新資訊架構

### 3.1 Route Groups 重組(結構大改的核心)

利用 App Router 的 route group,把「殼」收斂到三個 layout,**頁面本身不再 render Navbar、不再傳 user props、不再寫 pt-24**:

```text
src/app/
├── layout.tsx                    # Providers only(現狀保留)
├── (marketing)/
│   └── page.tsx                  # Landing(未登入首頁)
├── (auth)/
│   └── login/page.tsx            # 置中卡片 layout,無導覽
├── (app)/                        # ★ 登入後的 App Shell
│   ├── layout.tsx                # Server Component:getSession → <AppShell user>
│   │                             #   桌機:頂部導覽列;行動:頂部精簡列 + 底部 TabBar
│   ├── trips/
│   │   ├── page.tsx              # 我的行程
│   │   └── [id]/
│   │       ├── layout.tsx        # ★ 行程空間殼:行程名 + 分頁列(見 5.2)
│   │       ├── page.tsx          # 總覽(支出列表為主)
│   │       ├── itinerary/ settlement/ stats/ checklists/ activity/ settings/
│   ├── map/  stats/  wrapped/  settings/
└── (public)/                     # 免登入分享頁:join、link-virtual、map/share、wrapped/share
    └── layout.tsx                # 唯讀殼(logo + 語言/主題切換 + 登入 CTA)
```

配套:

- `(app)/layout.tsx` 在 server 端取 session,未登入直接 redirect(與 [proxy.ts](../src/proxy.ts) 的保護互補),`user` 一次注入 shell —— 刪掉 19 處 user 映射。
- 各頁的 loading 態改用 App Router 的 `loading.tsx` 放 [skeletons](../src/components/skeletons/index.tsx),錯誤態統一用 `error.tsx` + 現有的 `ErrorState`(終於用上它)。

### 3.2 全域導覽:雙形態

```text
行動(< md)                             桌機(≥ md)
┌──────────────────────────┐           ┌────────────────────────────────────────┐
│ ◀ 頁面標題          🔔 ⋯ │  頂列     │ 🧭 旅行記帳  行程 地圖 統計 回顧   🔔 👤 │
│                          │           └────────────────────────────────────────┘
│        (內容區)          │           內容區維持現在的 container 版型
│                          │
│                    (＋)  │  FAB(僅記帳情境)
├──────────────────────────┤
│  🧳     🗺️     📊    👤  │  底部 TabBar(safe-area-inset-bottom)
│ 行程   地圖   統計   我的 │
└──────────────────────────┘
```

- **底部 TabBar 四項**:行程(預設首頁)/地圖/統計/我的。「我的」整合 個人設定、Wrapped 年度回顧、語言、主題、登出 —— Wrapped 是季節性功能,不值得佔一級入口;漢堡選單整個刪除。
- 頂列在行動端只做三件事:返回(情境性)、目前位置標題、通知鈴鐺。語言/主題切換移入「我的」,騰出頂列空間(現在頂列同時塞 語言+主題+鈴鐺+漢堡 四顆,已經放不下標題)。
- 登入入口頁由 `/`(行銷頁)改為登入後直接落在 `/trips`,`start_url` 一致(見 6)。

---

## 4. 設計系統

### 4.1 色彩:建立品牌 token,消滅散裝色

建議品牌主色採 **青藍(teal)系** —— 旅行/地圖/天空的聯想,與現有地圖模式、圖表色不衝突;輔以珊瑚色作強調(金額、FAB 可選)。全部進 CSS variables:

```css
:root {
  --primary: 174 62% 38%;            /* teal-600 級,主按鈕/FAB/連結 */
  --primary-foreground: 0 0% 100%;
  --accent-warm: 16 85% 60%;         /* 珊瑚,金額強調、Wrapped 情感色 */
  /* 語意色(取代 28 處散裝 Tailwind 色) */
  --success: 152 60% 36%;  --warning: 38 92% 50%;  --info: 217 91% 60%;
  /* 功能域色:只保留「圖表/分類」允許多色,由 --chart-* 供應 */
}
.dark { /* 同名 token 提供深色值;theme_color 與 --background 必須同源 */ }
```

規則(可 lint):**`src/components`、`src/app` 內禁止出現 `text-{palette}-{n}`/`bg-{palette}-{n}` 調色盤 class**,一律使用語意 token。行程詳情那七顆彩色入口按鈕的顏色全部移除 —— 分頁化後它們也不存在了(見 5.2)。

Toast 收斂成三種變體 `success | error | default`,在 [toast.tsx](../src/components/ui/toast.tsx) 內建樣式,刪除呼叫端的 `className: 'bg-green-500...'`。

### 4.2 字級與間距

- 標題階層固定三級:頁面 `text-2xl/bold`、區塊 `text-lg/semibold`、卡片 `text-base/medium`。目前 `text-3xl`/`text-2xl`/`text-xl` 在不同頁面混用同一層級,統一即可。
- 金額使用 `tabular-nums` + 等寬數字字體特性(Inter 支援 `font-feature-settings: "tnum"`),列表對齊會明顯變好。
- 觸控目標:互動元素最小 `h-11`(44px);支出卡的編輯/刪除從並排 icon 改為整卡點擊進詳情 + 詳情內操作(或 long-press/swipe 顯示動作)。

### 4.3 元件整併清單

| 動作 | 內容 |
|---|---|
| **統一** | `ExpenseListItem`:以 TripExpenses 內嵌版為基礎抽出,刪除 [ExpenseCard.tsx](../src/components/expenses/ExpenseCard.tsx)(死碼);修正其中 NT$ 硬編碼、`Day N` i18n。 |
| **啟用** | `PageHeader`、`ErrorState`、`LoadingState` 全站導入,刪除 9 頁手刻返回鍵/錯誤畫面。 |
| **新增** | `AppShell`、`BottomTabBar`、`Fab`、`ResponsiveFormSheet`(md 以上 Dialog、以下全螢幕 Sheet —— shadcn 的 [sheet.tsx](../src/components/ui/sheet.tsx) 已存在但目前 0 使用)、`EmptyState`(通用空狀態,吃 icon+標題+CTA)。 |
| **拆解** | `ExpenseFormDialog`(701 行)拆成 `ExpenseFormFields` + 金額/幣別、分帳、附件、標籤四個子區塊;[settings/page.tsx](../src/app/settings/page.tsx)(588 行)拆成 個人資料/安全性/通知 三個 section 元件。 |
| **移除** | 主內容外層的 Collapsible(支出列表、成員列表不再可收合)。 |

---

## 5. 關鍵頁面重新設計

### 5.1 我的行程 `/trips`

- 拿掉外層那張「假 Card」(`border-none shadow-none bg-transparent sm:bg-card` 的權宜寫法),行程卡直接鋪在頁面上。
- 行程卡升級為**封面卡**:目的地/日期/成員頭像堆疊/預算進度條,一眼可比較;進行中的行程置頂並標記「進行中 · Day 3」。
- 「建立行程」在行動端由 FAB 承擔;「加入行程」保留為次要按鈕。

### 5.2 行程空間 `/trips/[id]`(改動最大、價值最高)

以 `trips/[id]/layout.tsx` 建立**行程內分頁殼**,取代現在的 7 顆入口按鈕:

```text
┌──────────────────────────────┐
│ ◀  東京五日遊         ⋯ 更多 │   ⋯ = 預算、活動紀錄、行程設定、分享
├──────────────────────────────┤
│ 💰支出 | 🗺️行程 | 🧮結算 | 📊統計 | ✅清單 │   ← 可橫向滑動的分頁列(sticky)
├──────────────────────────────┤
│  總支出 NT$48,200 / 預算 60,000 ▓▓▓▓░░   │   ← 常駐摘要條(跨分頁)
│                              │
│  [支出分頁 = 預設落點]        │
│  日期分組的支出列表           │
│  搜尋/篩選 收進工具列 icon    │
│                        (＋)  │   ← FAB:新增支出(行程空間內永遠在)
└──────────────────────────────┘
```

- 子頁(itinerary/settlement/stats/checklists)**保留現有 route 與內容元件**,只是掛進這個 layout —— URL 不變、深連結不變、改動集中在殼。
- 「支出」分頁即原本的 TripExpenses,但:依日期分組(旅程中的心智模型是「今天花了什麼」)、預設全展開、篩選面板收進 icon、每筆卡片精簡為 單行摘要 + 點擊展開詳情(分帳、收據、留言)。
- 活動紀錄/預算/設定 移入右上「更多」選單:低頻功能不佔分頁。

### 5.3 新增支出(最高頻操作)

- 行動端:全螢幕 Sheet,由下滑入;欄位排序按輸入頻率:**金額(大字數字鍵盤優先聚焦)→ 描述 → 分類(icon 網格一排選)→ 進階(幣別/日期/分帳/附件/標籤 折疊,預設值:今天、TWD、平分全員)**。理想流程:金額 → 描述 → 送出,三步完成。
- 桌機:維持 Dialog,同一套表單元件(`ResponsiveFormSheet`)。
- 離線 pending 標記(已有)保留,並在 FAB 附近顯示「N 筆待同步」輕量提示,取代只靠橫幅。

### 5.4 結算 `/trips/[id]/settlement`

內容邏輯不動,重點是**把「我」放大**:頁首先講「你應收 NT$1,250 / 應付 NT$0」,其他成員的餘額表與轉帳方案往下排。目前的資訊層級是全員平鋪,使用者要自己掃描找自己。

### 5.5 個人設定 `/settings` →「我的」

改為列表式選單(頭像+名稱 → 帳號與安全 → 通知 → 外觀(主題/語言) → 年度回顧 → 登出),每項進入獨立子頁或 Sheet。588 行單頁表單拆掉,行動端捲動地獄消失。

---

## 6. PWA 體驗深化

| 項目 | 現況 | 改為 |
|---|---|---|
| manifest 名稱 | "Travel Budget App"(英文) | 「旅行記帳 Travel Budget」,`short_name`「旅行記帳」 |
| `theme_color` | 固定 `#fff` | 與 `--background` 同源;`<meta name="theme-color">` 已分深淺([layout.tsx:33-38](../src/app/layout.tsx#L33-L38)),但深色值需改為與新 token 一致(現在 `#0f172a` ≠ zinc 背景) |
| `shortcuts` | 無 | 「➕ 記一筆」(deep link 至最近行程的新增支出)、「🧳 我的行程」 |
| `screenshots` | 無 | 補 narrow + wide 各 1–2 張,Android 才有富安裝 UI |
| safe area | 無任何處理 | `viewport-fit=cover` + TabBar `pb-[env(safe-area-inset-bottom)]`、頂列 `pt-[env(safe-area-inset-top)]` |
| 離線回饋 | 全域橫幅 | 保留橫幅 + 待同步筆數徽章;唯讀功能(結算/統計)離線時顯示「快取資料 · 最後更新時間」 |
| App 內更新 | 無 | SW 有新版本時顯示「有新版本,點擊更新」toast(Serwist `skipWaiting` 流程) |

---

## 7. 實施路線圖

每個 Phase 可獨立出 PR、獨立上線,順序刻意讓「殼」先行,後面的頁面改造都變便宜。

### Phase 0|止血與清理(小,1–2 天)
- 刪除死碼 `ExpenseCard.tsx`;修 i18n 漏網(`Error` 標題、`Split with`、`Day N`、NT$ 硬編碼)。
- Toast 三變體收斂;`theme_color` 與背景 token 對齊;manifest 名稱/描述中文化 + `shortcuts`。
- 觸控目標拉到 44px。

### Phase 1|App Shell + 導覽(中,3–5 天)★ 投資報酬率最高
- 建立 `(app)/(auth)/(public)` route groups 與 `AppShell`(頂列 + 桌機導覽 + 行動 BottomTabBar + safe-area)。
- 各頁刪除自帶 Navbar/user 映射/`pt-24`;`loading.tsx`/`error.tsx` 統一載入與錯誤態。
- 「我的」頁承接 設定/Wrapped/語言/主題/登出。

### Phase 2|行程空間分頁化(中大,4–6 天)
- `trips/[id]/layout.tsx` 分頁殼 + 常駐摘要條 + 行程內 FAB;七顆入口按鈕與散裝色移除。
- 支出列表:日期分組、卡片精簡、篩選收納;移除主內容 Collapsible。

### Phase 3|設計 Token 與品牌(中,2–4 天)
- 導入品牌色/語意色 token(4.1),全站替換 28 處散裝色;加 lint 規則防再犯。
- 字級三級制、金額 `tabular-nums`;空狀態統一 `EmptyState`。

### Phase 4|高頻流程重製(中大,4–6 天)
- `ResponsiveFormSheet` + 新增支出表單重排(金額優先、三步完成)、701 行表單拆解。
- 結算頁「以我為中心」重排;`/settings` 拆分;SW 更新提示。

> 風險控制:所有 Phase 都不動 Server Actions / 資料層 / route URL(深連結、通知 email 內的連結全部不受影響)。Phase 1、2 動到頁面骨架,建議搭配 `pnpm build && pnpm start` 實測 PWA(SW 在 dev 不啟用,見 CLAUDE.md)。

---

## 8. 驗收指標

- **操作成本**:行動端「打開 App → 完成記一筆」≤ 3 次點擊(現況:首頁 → 行程 → 展開支出卡 → 右上小 + → 填 8 欄位表單)。
- **一致性**:`git grep -E "text-(rose|violet|amber|green|blue|orange)-[0-9]"` 在 `src/components`/`src/app` = 0;`Navbar` 只在 layout 出現 1 次;`pt-24` = 0。
- **PWA**:Lighthouse PWA 全綠;iPhone standalone 下無內容被瀏海/Home Indicator 遮擋;長按圖示出現「記一筆」捷徑。
- **i18n**:四語 catalog 無缺 key,元件內無硬編碼使用者可見字串。
- **可及性**:互動元素 ≥ 44px;分頁列/TabBar 可鍵盤操作且有 `aria-current`。

---

## 附錄:本次評估中定位到的具體修改點速查

| 檔案 | 問題 |
|---|---|
| [src/components/layout/Navbar.tsx](../src/components/layout/Navbar.tsx) | 手機導覽藏漢堡選單;頂列擁擠;每頁重複掛載 |
| [src/app/trips/[id]/page.tsx](../src/app/trips/%5Bid%5D/page.tsx) | 7 入口 hub;錯誤畫面硬編碼 "Error";user props 映射 |
| [src/components/trips/detail/TripExpenses.tsx](../src/components/trips/detail/TripExpenses.tsx) | 544 行;主內容 Collapsible;NT$/Day N 硬編碼;內嵌第二套支出卡 |
| [src/components/expenses/ExpenseCard.tsx](../src/components/expenses/ExpenseCard.tsx) | 死碼 + 硬編碼英文 |
| [src/components/common/PageHeader.tsx](../src/components/common/PageHeader.tsx) | 已存在但全站未使用 |
| [src/components/trips/detail/dialogs/ExpenseFormDialog.tsx](../src/components/trips/detail/dialogs/ExpenseFormDialog.tsx) | 701 行;行動端不適用置中 Dialog |
| [src/app/settings/page.tsx](../src/app/settings/page.tsx) | 588 行單頁平鋪 |
| [src/app/trips/page.tsx](../src/app/trips/page.tsx) | toast 硬編碼綠色 ×3;假 Card 版型 |
| [src/app/globals.css](../src/app/globals.css) | shadcn 預設灰階,無品牌 token、無語意色 |
| [src/app/manifest.ts](../src/app/manifest.ts) | 英文名稱、白色 theme_color、無 shortcuts/screenshots |
| [src/app/layout.tsx](../src/app/layout.tsx) | 深色 theme-color 與背景 token 不一致;未建立 route group 殼 |
