# 航空會籍積分與里程紀錄（Loyalty Ledger）規劃

> 建立日期：2026-07-14 · 狀態：**Phase 1（國泰 MVP）完成 2026-07-14**；**Phase 2 長榮 BR
> （哩程＋航段制）＋航空／飯店雙 tab 完成 2026-07-15**，餘 Phase 2 華航 CI／BR 續卡精算、Phase 3（ROADMAP #20）。
> 完成後依 [README.md](./README.md) 慣例：實作筆記入 FEATURES.md、CHANGELOG 加一行、刪 ROADMAP 項，本檔刪除（草圖查 git 歷史）。

## 1. 背景與定位

使用者想追蹤航空會籍的升等／保級進度（先做國泰，未來擴及華航、長榮）與里數累積。
**更遠期會加入飯店會籍**（Marriott Bonvoy／Hilton Honors 等，夜數制）並呈現在**同一個「會籍」頁**——
因此本規劃的命名與資料形狀一律不綁「航空」（model 叫 Loyalty* 而非 Airline*、tab 叫「會籍」）。

**核心定位：這是「積分記帳」，不是「積分計算器」。**
精確計算一段航班賺多少積分需要訂位艙等字母（fare class）、各家年年變動的計算表、
且積分還來自信用卡／酒店等 app 外來源——自動計算永遠對不上官方數字。
因此：**數字由使用者從航空 app 抄過來手動記**，app 負責的是加總、對照門檻、呈現進度。
這與本產品「記帳」的 DNA 一致，也是可長期維護的邊界。

歸屬：**user-level 終身資料**（同收藏牆／FlightRecord），非 trip-scoped、僅本人可讀寫、
絕不進公開分享路由。

## 2. 目標／非目標

**目標**
- 手動記錄積分／里數進出（ledger），飛行來源可一鍵連結既有 FlightRecord。
- 依 program 規則常數計算升等／保級進度（純函式，好測）。
- 多 program 架構：MVP 只實作國泰（CX），schema 與型別先留好華航（CI）、長榮（BR）的路。

**非目標（刻意不做）**
- 自動精算單一航班的積分／里數（fare class 表、寰宇一家／星盟夥伴全表）。
- 自動判定會籍等級（等級由使用者自己設定，app 只顯示「距離門檻還差多少」）。
- 兌換價值計算、爬官方網站、里數效期自動追蹤（效期規則各家不同且需再查證）。

## 3. 制度調查摘要（2026-07-14 查證，動工時需重新查證）

| | 國泰 CX（2027 新制） | 華航 CI（2026 新制） | 長榮 BR |
|---|---|---|---|
| 資格貨幣 | 會籍積分 Status Points | 會籍積分（與哩程分離） | 卡籍哩程＋國際線航段數 |
| 等級門檻 | 銀 300／金 600／鑽 1,200／鑽石行政 2,400 | 金 360／翡翠 720／晶鑽 1,400（一年內） | 12 個月升等：銀 30,000 哩+4 段/26 段、金 50,000 哩/50 段、鑽 120,000 哩/100 段（2026-07 查證） |
| 續會 | 門檻減半（金 300／鑽 600／行政 1,200） | 兩年內 金 580／翡翠 1,150／晶鑽 2,240 | 卡籍效期 2 年，續卡由新會期重算 |
| 計算窗口 | **曆年制**（1/1–12/31），積分升等不歸零 | 一年（升等）／兩年（續會） | **滾動 12 個月**（升等） |
| 特殊規則 | 金卡以上超額積分 **50% 結轉**次年；2026 為過渡年（同批積分算 2026 保級＋2027 定級） | 積分需 **≥50% 來自華航／華信航班** | 航段須長榮／立榮國際線；星盟夥伴可計卡籍哩程 |
| 可花里數 | Asia Miles（不受改制影響） | 哩程（兌換用，與積分分離） | 哩程（兌換與卡籍共用同一累積，另有獎勵加成） |

**設計上重要的觀察**：
1. 規則形狀只有兩種——「積分制」（CX、CI）與「哩程＋航段制」（BR）。抽象只需涵蓋這兩種，
   不要做通用規則引擎。（遠期的飯店會籍是第三種「夜數制」，屆時在 `ProgramRules`
   union 加一個 `kind: 'nights'` 即可，見 §8。）
2. 規則**年年變**（CX 2025/8 改表、2027 改制；CI 2026 改制）→ 門檻做成集中常數檔、
   標註查證日期，不散落在元件裡。
3. CI 的「50% 來自自家航班」與 BR 的「航段須自家」→ ledger entry 需要 `ownAirline` 旗標，
   **Phase 1 就要進 schema**（避免日後 migration backfill）。

來源：[trip.com 國泰改制](https://hk.trip.com/guide/info/國泰會員改制.html)、
[里先生 CX 攻略](https://www.mrmiles.hk/cathay/)、
[傑私聊 CX 2025/8 改表](https://jazztalk.tw/cathay-pacific-changes-to-status-points-and-asia-miles-earnings-on-flights/)、
[傑私聊 CI 新制](https://jazztalk.tw/china-airlines-dynasty-member-new-system-guide/)、
[長榮官網晉升與續卡標準](https://www.evaair.com/zh-tw/infinity-mileagelands/about-infinity-mileagelands/upgrade-and-renewal-requirement/)。

## 4. 資料模型

新增兩個 collection（新 model、無既有資料，不需資料遷移；index 建立比照 FlightRecord 慣例）。

### `LoyaltyAccount` — 使用者在某 program 的帳戶（一人一 program 一筆）

```ts
{
  user: ObjectId,                  // ref User
  program: string,                 // program key（MVP 只開放 'CX'；enum 集中在 constants/loyalty.ts，
                                   // 未來直接加 'CI'|'BR'|'MARRIOTT'|'HILTON'…，不綁航空）
  currentTier: string,             // program 專屬 tier key（如 'green'|'silver'|'gold'|'diamond'）
  tierExpiresAt: Date | null,      // 卡籍效期（BR 兩年制用；CX 曆年制可 null）
  memberNo: string,                // 會員號（選填，僅顯示用）
  note: string,
}
// index: { user: 1, program: 1 } unique
```

`currentTier` 由使用者自己設定——app 不自動升降級（見 §2 非目標），只在進度達標時顯示提示。

### `LoyaltyEntry` — 積分／里數進出的 ledger（唯一加總來源）

```ts
{
  user: ObjectId,
  program: string,                 // 同 LoyaltyAccount.program
  date: Date,
  type: 'flight' | 'stay' | 'card' | 'dining' | 'promo' | 'adjust' | 'other',
  statusPoints: number,            // 會籍積分（CX/CI）；可負（adjust）
  qualifyingMiles: number,         // 卡籍哩程（BR）；積分制 program 恆 0
  awardMiles: number,              // 可花里數變動；可負（兌換、過期沖銷）
  ownAirline: boolean,             // 自家航班（CI 50% 條款、BR 航段判定）
  flightRecord: ObjectId | null,   // 連結 FlightRecord（「從飛行紀錄帶入」時記錄，防重複）
  note: string,
}
// index: { user: 1, program: 1, date: -1 }；{ flightRecord: 1 }
```

**刻意決策：不在 FlightRecord 上加積分欄位。**
理由：(1) 加總永遠只查一個 collection；(2) 非飛行來源（信用卡／酒店）本來就只能進 ledger，
飛行走同一條路資料形狀才一致；(3) FlightRecord 維持「搭過什麼」的語意不膨脹。
「從飛行紀錄帶入」= 建一筆 `type: 'flight'` 的 entry 並存 `flightRecord` ref，
UI 以此判斷「已帶入」防重複（同 FlightRecord ↔ `sourceActivity` 的既有模式）。

BR 的「航段數」不另設欄位：= 該 program 內 `type === 'flight' && ownAirline` 的 entry 數。

**飯店會籍預留**：屆時對 entry **加欄位不改欄位**——`qualifyingNights: number`（合格夜數）與
`stayRecord: ObjectId | null`（連結既有 [StayRecord](../src/models/StayRecord.ts)，
「從住宿紀錄帶入」與飛行帶入同一模式）。純新增選填欄位，不需 migration。

### Program 規則常數 — `src/constants/loyalty.ts`

```ts
type TierRule = { key: string; threshold: number; renewalThreshold?: number };

type ProgramRules =
  | { kind: 'points'; membershipYear: 'calendar' | 'anniversary';
      tiers: TierRule[];
      rollover?: { ratio: number; minTier: string };   // CX: 50%、金卡以上
      ownAirlineMinRatio?: number }                     // CI: 0.5
  | { kind: 'milesAndSegments'; window: 'rolling12m';
      tiers: { key: string; miles: number; segments: number; segmentsOnly?: number }[] };

// 每個 program 附 verifiedAt（查證日期）；MVP 只填 CX，CI/BR 留 TODO 並在 UI 隱藏
```

## 5. 計算邏輯 — `src/lib/loyalty.ts`（純函式）

```ts
computeLoyaltyProgress(entries, rules, asOf, currentTier) => {
  windowPoints / windowMiles / windowSegments,  // 依 rules 的窗口聚合（曆年 vs 滾動12月）
  nextTier, pointsToNextTier,                   // 距下一級
  renewalMet,                                   // 續會門檻是否已達
  carryOverEstimate,                            // CX：超額 × 50% 結轉試算
  ownAirlineRatio,                              // CI：自家占比（<50% 時 UI 警示）
  awardMilesBalance,                            // awardMiles 加總（全期間）
}
```

與 [lib/badges.ts](../src/lib/badges.ts) 同風格：無 IO、輸入輸出皆 plain object、單元測試齊全。
CX 過渡年（2026 雙算）不特別實作——上線時已是 2027 制；若提早上線，過渡提示用文案處理即可。

## 6. Server Actions — `src/actions/loyalty.ts`

比照 collections（FlightRecord）的既有做法：user-level、無 trip membership 檢查。

- `upsertLoyaltyAccount` / `deleteLoyaltyAccount`（刪帳戶連帶刪該 program 的 entries——手動級聯）
- `createLoyaltyEntry` / `updateLoyaltyEntry` / `deleteLoyaltyEntry`
- `importFlightAsLoyaltyEntry(flightRecordId, { statusPoints, awardMiles, ... })` —
  帶入日期／航班資訊，數字仍由使用者填
- 查詢彙總進 collections 現有的讀取 action 或新增 `getLoyaltyOverview`

Checklist（JUDGMENT §2）：`'use server'`、`withAuth`、Zod schema 進
[validation.ts](../src/lib/validation.ts)、回傳 `ActionResult<T>`、從 `src/actions/index.ts` re-export、
**刪除使用者帳號的級聯要納入兩個新 collection**（比照 FlightRecord 現況處理位置）。

## 7. UI

獨立頁 **`/memberships`（會籍）**（As-built：MVP 曾掛在收藏牆 tab，後獨立成專頁——
組件 `LoyaltyTab` 原地複用、字串仍在 `collections.loyalty.*`；頁下保留飯店區塊 placeholder 待 Phase 2）：

- **Program 卡**（MVP 一張 CX 卡）：目前等級、升等進度條（本窗口積分／下一級門檻）、
  續會狀態、CX 結轉試算、里數餘額、「規則查證於 YYYY-MM，實際以官方為準」disclaimer。
- **Entry 列表**：新到舊、CRUD dialog（型別、日期、積分、里數、自家航班 toggle、備註）。
- **飛行帶入**：航空 tab 的 FlightRecord 卡片選單加「記入會籍積分」→ 開 entry dialog
  預填日期／備註（航班號），已帶入者顯示標記。
- 進度條／環的視覺依 dataviz skill 慣例處理。

i18n：新字串**四語系全補**（含各 program 的 tier 名稱 key，如
`loyalty.cx.tiers.gold` = 金卡／Gold／金卡／ゴールド）。

## 8. 分期

| Phase | 內容 | 成本 |
|---|---|---|
| **1（MVP）✅** | CX only：兩個 model＋actions＋`lib/loyalty.ts`＋會籍 tab＋飛行帶入＋i18n＋測試 | M |
| **2a（BR）✅ 2026-07-15** | `ProgramRules` 加 `milesAndSegments` kind、`computeMilesSegmentsProgress`（滾動 12 月、哩程／航段雙路徑）、多 program 編排（AirlineMemberships）＋航空／飯店雙 tab、entry program-aware（卡籍哩程＋自家航段勾選）。**BR 續卡（24 月窗口）未精算——以文案提示** | S |
| **2b（待做）** | 華航 CI（積分制＋自家占比警示，門檻動工時重查）；BR 續卡精算 | S |
| **3（可選）** | 積分「預估」輔助：填航班時依機場大圓距離（[airports.json](../public/data/airports.json) 已有 lat/lon）× 客艙給 SP **區間**預估，帶生效日期的規則表；明示為預估、可改 | M |
| 之後再議 | **飯店會籍**（Marriott／Hilton／IHG…夜數制）：`ProgramRules` 加 `kind: 'nights'`、entry 加 `qualifyingNights`＋`stayRecord` ref、同一「會籍」tab 多幾張 program 卡——架構不變，純加法 | — |
| 之後再議 | 里數效期提醒（各家效期規則需查證）、awardMiles 兌換紀錄分類統計 | — |

Phase 1 的 schema 已含 Phase 2 所需欄位（`program` enum、`qualifyingMiles`、`ownAirline`），
Phase 2 **不需 migration**。

## 9. 風險與維護原則

1. **規則過期**是最大風險：所有門檻集中在 `constants/loyalty.ts` 一檔、每 program 標
   `verifiedAt`；UI 永遠帶「以官方為準」。改規則＝改常數＋跑測試，不動 schema。
2. **不自動判級**：進度顯示與使用者自設等級並存，數字對不上時使用者自己修 entry，
   app 不猜。
3. 隱私：兩個新 collection 比照 FlightRecord——不進 `/api/public/*`、不進公開收藏牆
   分享（連彙總數字都不進，會籍屬敏感個資）。

## 10. 測試計畫

- `lib/loyalty.ts` 單元測試：曆年窗口切齊、滾動 12 月邊界、跨級（銀直升鑽）、
  結轉試算（恰好達標／超額／未達最低結轉等級）、CI 占比、負數 entry（adjust／兌換）。
- actions 測試比照現有 collections actions 的覆蓋方式。
- UI 手動走一輪：建帳戶 → 手動 entry → 飛行帶入 → 防重複 → 進度條數字對手算。
