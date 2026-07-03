# 功能藍圖（Feature Roadmap）

> 建立日期：2026-06-26（最後更新：2026-07-03）
> 性質：產品功能藍圖——只列**尚未動工**的功能構想，附優先序與落地草圖（schema / actions / UI 影響）。
> 相關文件：**已完成功能**的紀錄見 [CHANGELOG.md](./CHANGELOG.md)、實作細節見 [FEATURES.md](./FEATURES.md)；架構見 [ARCHITECTURE.md](./ARCHITECTURE.md)；程式碼 / 基礎設施層級的改善見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

圖例：💎 旗艦（高價值、定義產品）　⭐ 高價值　🔹 加值 / 驚喜
成本：S（數天）／M（一兩週）／L（需基礎設施或大改）

> 慣例：本文件只列**待辦**。功能一旦完成 → 實作筆記寫進 [FEATURES.md](./FEATURES.md)、在 [CHANGELOG.md](./CHANGELOG.md) 加一行、並把本檔該項刪掉。原始草圖如需回顧，查本檔 git 歷史。

---

## 待辦

### 11b. 🔹 第三方登入 (OAuth) — M〔頭像已完成，OAuth 待做〕
**為什麼**：降低註冊摩擦。
**做法**：Google 登入可用 Auth.js 或自建，與現有自製 JWT 並存。

### 12. ⭐ 好友系統 (Friends) — M〔原「常用旅伴」升級〕
**為什麼**：常和同一群人出遊，每次重加很煩；雙向好友關係也是未來社交功能（好友的年度回顧、好友地圖疊層、足跡排行榜）的共用地基，比單向 companions 清單值得多花的成本。

**分四個 phase 落地**（每個 phase 獨立可出貨、各自是一個閉環）：

**Phase 1 — 好友核心（model + actions + 管理 UI）** ✅ 已完成
> 註：本專案目前無「刪帳號」流程，故 `Friendship` 清理路徑暫無掛載點。
- **Schema**：獨立 `Friendship` collection（`requester` / `recipient` / `status: pending|accepted`），排序後的 user pair 建 unique compound index 防重複與反向重複。不要塞 `User.friends[]` 陣列——好友是「關係 + 狀態機」，單一文件讓「接受好友」是一次原子更新（Mongo 無 cascade，雙陣列會有不一致風險），也預留未來 `blocked` 狀態。虛擬成員（`isVirtual`）排除在外。
- **Actions**：邀請 / 接受 / 拒絕 / 刪除 / 列表（好友清單 + 收到與送出的 pending）。
- **入口（首選）**：旅程成員頁「加好友」按鈕（已同遊過，零隱私疑慮，且 userId 現成）；虛擬成員不顯示。
- **設定頁好友管理卡片**：好友列表 + pending 收件匣（接受 / 拒絕 / 收回）。Phase 2 通知上線前，這是收件者唯一能看到邀請的地方，**必須包含在本階段**。
- 刪帳號 / 相關清理路徑手動刪 `Friendship`（無 cascade）、四語系、狀態機單元測試。
- **驗收閉環**：A 在成員頁對 B 發邀請 → B 在設定頁接受 → 雙方好友列表互見。

**Phase 2 — 通知整合** ✅ 已完成
- `Notification.trip` 改 **optional**（好友邀請不屬於旅程；舊資料全有 trip，免遷移）。
- 新類型 `friend_request`（建議同時加 `friend_accepted`，發起者才知道結果）。
- `notify()` 的 `recipientIds` 指定收件人變體**已存在**，缺的是「無 `tripId`」路徑：跳過 Trip 查詢、`tripName` 留空，Email / Push 模板與鈴鐺點擊改深連結到設定頁好友卡片。
- 四語系（`notifications.<type>`）補齊。

**Phase 3 — 匯入旅程（原始痛點兌現）** ✅ 已完成（兩個入口）
- **成員頁**（設定）「從好友加入」多選對話框 + **建旅程**表單內建「邀請好友一起（可選）」勾選清單，兩處都**直接加入**成員（好友關係即同意；分享連結加入本就無審核，權限面不變寬）+ 每位被加入者發 `member_joined` 通知與動態牆。
- `addFriendsToTrip` action 成員層級（非僅管理員）、只收 accepted 好友、排除已是成員者、去重排除自己；建旅程流程於 `createTrip` 成功後 best-effort 呼叫同一 action（失敗不擋建立）。
- i18n（四語）、測試（`member.actions.test.ts`）皆完成。

**Phase 4 — 加好友入口擴充（可選加值）**
- **好友邀請連結**：`User.friendInviteCode`（沿用 hashCode 慣例，比照 `User.mapShareCode` 的 opt-in sparse-unique），落地頁登入後一鍵發邀請。
- **帳號搜尋**：僅允許 username/email **完全比對**（防使用者列舉）。

### 14. 🔹 PDF 行程 / 結算報告 (PDF reports) — M
**為什麼**：目前只有 CSV。一份漂亮的「旅程結算單 / 行程手冊」PDF 很適合分享與報帳。
**做法**：既有 [src/lib/exporters/](../src/lib/exporters/) 已抽象化，新增 PDF exporter（`@react-pdf/renderer` 或伺服端 puppeteer）。

### 進階深化（已完成功能的延伸）
- **#1 預算**：每日步調、每人預算。
- **#3 分帳**：逐項分帳（item-level split）。
- **#5 離線**：擴大範圍到離線編輯 / 刪除、結算 / 統計離線重算。
- **#7 清單**：清單範本複用。
- **#15 回顧**：topCountry / 最愛目的地（需國碼→在地化國名查表）、公開圖卡下載、逐 story 翻頁動畫。

> 基礎設施類待辦（Public API 限流、actions 測試覆蓋、支出伺服端分頁）見 [IMPROVEMENTS.md](./IMPROVEMENTS.md)。

---

## 建議落地順序

```
中等（M）
  ├── 12 好友系統
  ├── 14 PDF 報告
  └── 11b OAuth 登入
```

**新功能慣例**：DB 存取走 Mongoose + `dbConnect()`，業務邏輯走 server actions 回傳 `ActionResult<T>`，新使用者字串**四語系都要補**，新識別碼沿用 `hashCode` 格式（見 [hashcode.ts](../src/lib/hashcode.ts)）。實作前各項仍需獨立設計（schema 遷移、i18n、測試），再逐項開票動工。
