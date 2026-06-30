# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Travel Budget Planner (旅行記帳) — a multi-user trip expense tracking and bill-splitting app. Next.js 16 (App Router) + React 19 + TypeScript, backed by MongoDB (Mongoose ODM). UI uses Shadcn UI (Radix) + Tailwind. Internationalized with next-intl.

## Commands

```bash
pnpm dev               # Dev server (http://localhost:3000), Turbopack
pnpm build             # Production build — runs `next build --webpack` (see PWA note below)
pnpm lint              # ESLint (next lint); lint:fix to autofix
pnpm format            # Prettier write; format:check to verify
pnpm test              # Vitest (watch mode)
pnpm test:run          # Vitest single run (use this in CI / one-shot)
pnpm test:coverage     # Coverage report (v8)
```

Run a single test file or test:
```bash
pnpm vitest run src/__tests__/settlement.test.ts
pnpm vitest run -t "test name substring"
```

## Architecture

### Data layer: Server Actions, not REST
The primary backend is **Server Actions** in [src/actions/](src/actions/) (`'use server'`), re-exported through [src/actions/index.ts](src/actions/index.ts). Components call these directly. Every action returns the discriminated union `ActionResult<T>` from [src/actions/types.ts](src/actions/types.ts) (`{ success: true, data }` | `{ success: false, error, code }`) — never throw across the action boundary; convert errors to this shape. Error `code`s come from `ErrorCodes`.

The `/api` REST routes are a separate, narrower surface:
- [src/app/api/public/](src/app/api/public/) — **intentionally unauthenticated** read-only share endpoints (view a trip via its `hash_code` without logging in). Do not add session checks here; that is by design.
- [src/app/api/exchange-rates/](src/app/api/exchange-rates/) — currency rate proxy.

### Database: MongoDB via Mongoose
Connection goes through [src/lib/mongodb.ts](src/lib/mongodb.ts) `dbConnect()`, which caches the Mongoose connection on `globalThis` — **critical for serverless** (avoids exhausting connections across Vercel cold starts / HMR). Any code that touches the DB must `await dbConnect()` first; in practice most actions get this for free because `getTripMembership` calls it.

Models live in [src/models/](src/models/) and use **embedded documents** to collapse the old relational tables:
- `User`
- `Trip` — **embeds `members[]`** (`{ user, role, joinedAt }`), replacing the old `trip_members` table; indexed on `members.user`
- `Expense` — **embeds `splits[]`** (`{ user, shareAmount }`), replacing `expense_splits` (so loading expenses never N+1s)
- `ItineraryDay` — compound unique index on `(trip, dayNumber)`

`MONGODB_URI` has **no** `NEXT_PUBLIC_` prefix; it is never exposed to the client. There is no RLS — **all authorization is application-layer**, so every action that touches trip data must verify membership itself. MongoDB has **no FK cascade**: deleting a trip must manually delete its expenses + itinerary days (see `deleteTrip`).

### Auth
- Sessions: custom JWT (`jose`) stored in an httpOnly `session` cookie; `SessionPayload.userId` is the user's ObjectId **as a string**. See [src/lib/auth.ts](src/lib/auth.ts) (`getSession`, `createSession`, `getSessionFromRequest`). Passwords hashed with `bcryptjs`.
- Wrap actions with `withAuth(...)` ([src/actions/withAuth.ts](src/actions/withAuth.ts)) to inject a guaranteed-valid `session`, or call `getSession()` and early-return `UNAUTHORIZED`.
- Authorize trip access with `getTripMembership(userId, tripIdOrCode)` ([src/lib/permissions.ts](src/lib/permissions.ts)) — one `Trip.findOne` against the embedded `members` resolves ID + membership + role together. Prefer it over the `getTripId` / `isMember` / `isAdmin` helpers (kept for the public API routes).

### `tripIdOrCode` convention
Trip identifiers throughout the codebase may be either an **ObjectId string** or a public **`hash_code`** string (`[a-z0-9]{6,10}`; new trips generate 8, collision-fallback 10 — kept `< 12` so a hash_code is never mistaken for a 12-byte ObjectId). Resolution helpers (`getTripId`, `getTripMembership`) branch on `isValidObjectId(x)` — a 12-byte/24-hex ObjectId vs the short hash code, no ambiguity. Preserve this dual-acceptance when adding endpoints — **except** the public share routes under `/api/public/*`, which deliberately resolve **hash_code only** via `getTripIdByHashCode` (rejecting ObjectId closes a bypass around the share capability).

### Schema changes
Schemas are defined in [src/models/](src/models/); indexes are created by Mongoose on connect (`autoIndex`). Changing a field or index = editing the model. ID-shaped fields are ObjectId strings end-to-end (JWT, DTOs, frontend props).

For **reproducible** index/structure changes and data backfills there is also `migrate-mongo`: config in [migrate-mongo-config.js](migrate-mongo-config.js) (ESM, reads `MONGODB_URI`), scripts in [migrations/](migrations/), run via `pnpm migrate:status|up|down|create`. `autoIndex` stays on; migrations coexist with it (idempotent, index names aligned). See [docs/MIGRATIONS.md](docs/MIGRATIONS.md). There are no SQL migration files.

**Renaming/reshaping a stored field: write a migration first, don't lean on read-side fallbacks.** When a field changes shape (e.g. splitting `location` into `departureLocation` + `destinationLocation`), prefer a `migrate-mongo` script that backfills existing documents over scattering `newField ?? legacyField` fallbacks through the read paths (DTO mappers, actions, `.select(...)`). Make the migration idempotent (only touch docs not already migrated) and ship `down`. Once the data is normalized, delete the legacy field from the model and remove any temporary fallback so there is a single source of truth. Any fallback that must exist transitionally should be short-lived and removed in the same PR as the migration. Remember migrations only run where invoked — flag that other environments need `pnpm migrate:up` before deploying code that drops the fallback.

### Settlement
[src/lib/settlement.ts](src/lib/settlement.ts) — greedy creditor/debtor matching to minimize transfer count. Uses a `0.01` epsilon for float comparison. Covered by [src/__tests__/settlement.test.ts](src/__tests__/settlement.test.ts).

### Blob storage (Cloudflare R2)
Receipt attachments (`Expense.attachments[]`) and user avatars (`User.avatarUrl`) store files in **Cloudflare R2** (S3-compatible). [src/lib/storage.ts](src/lib/storage.ts) is a **server-only** R2 client wrapper (`presignPut`/`presignGet`/`headObject`/`deleteObjects`/`deleteByPrefix`/`avatarPublicUrl`) — never import it from a client component. Pure, unit-tested logic (content-type allowlist, size caps, key namespacing) lives in [src/lib/uploads.ts](src/lib/uploads.ts); client-side compression in [src/lib/imageCompress.ts](src/lib/imageCompress.ts). Non-obvious points:
- **Two buckets**: private `receipts` (presigned PUT to upload; membership-gated short-lived presigned GET via `getReceiptUrl` to view) and public `avatars` (presigned PUT; served from a stable public URL, no per-render signing). Keep the split — don't put receipts in the public bucket.
- **Uploads go direct to R2 via presigned PUT**, so large files never cross a server action. The key's owner segment (`receipts/<tripId>/`, `avatars/<userId>/`) is set **server-side** from membership/session, so the client can't target another owner's space. A presigned PUT can't cap what the client actually sends, so the persist step re-verifies size/type with **`headObject`** before saving the reference — keep that check when adding upload flows.
- **Receipts are private by contract**: `toExpenseDto` takes an `{ attachments }` option; the public expenses route passes `false` so receipts never reach the unauthenticated share page. Don't start returning them there.
- **`R2_*` env vars are optional** in [src/lib/env.ts](src/lib/env.ts); `getR2Config()` asserts them lazily (only when a blob feature runs) so boot / CI build work without R2 configured.
- **No storage cascade**: `deleteExpense`/`deleteTrip` delete receipt objects and `setAvatar`/`removeAvatar` delete the previous object, all **best-effort** (a failed blob delete logs but never fails the user action). Mirror this when adding paths that drop attachment/avatar references.

### Offline-first PWA (Serwist + TanStack Query persistence)
Offline support (ROADMAP #5) is split across two layers because **reads/writes go through Server Actions (POST RPC), which can't run or be cached offline**:
- **Service worker** via [Serwist](https://serwist.pages.dev) (`@serwist/next`): source in [src/sw.ts](src/sw.ts), compiled to `public/sw.js` (**gitignored + ESLint-ignored build artifact** — never hand-edit or lint it). Caches the app shell / static assets / Leaflet tiles / R2 images, NetworkFirst navigations falling back to static [public/offline.html](public/offline.html). It **must not** cache server-action POSTs or `/api/*` mutations.
- **Offline reads**: the TanStack Query cache is persisted to IndexedDB via [QueryProvider](src/components/providers/QueryProvider.tsx) (`PersistQueryClientProvider` + [src/lib/queryPersister.ts](src/lib/queryPersister.ts), `idb-keyval`). Previously-viewed trips render with no network. Bump `PERSIST_BUSTER` when the cached shape/keys change. Queries default to `networkMode: 'offlineFirst'`.
- **Offline writes** are scoped to **expense creation only** (edit/delete are online-only, guarded by `onlineManager.isOnline()`). The create mutation does an optimistic `onMutate` insert ([src/lib/optimisticExpense.ts](src/lib/optimisticExpense.ts), `optimistic_<uuid>` ids), pauses when offline, and replays on reconnect. Surviving a **reload** needs the mutationFn re-registered globally via `setMutationDefaults` ([src/lib/offlineMutations.ts](src/lib/offlineMutations.ts) `registerOfflineMutationDefaults`) because only the mutation key + variables are serialized — so create-mutation **variables must carry `tripId`**. `resumePausedMutations()` runs from the provider's restore `onSuccess`.
- **Build/dev gotcha**: Serwist runs on a webpack plugin and **Next 16's default Turbopack build silently skips it** (no error, no `sw.js`). Hence `pnpm build` is `next build --webpack`; don't revert it. The SW is disabled in dev, so test the PWA with `pnpm build && pnpm start`, not `pnpm dev`.
- **Web Push (ROADMAP #9 Phase 3) shares this same SW**: [src/sw.ts](src/sw.ts) adds `push` (renders the server-built payload via `showNotification`) + `notificationclick` (focus existing tab / open the deep link) handlers alongside the offline caching. **env-gated like R2/Resend**: `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` are all optional, `getWebPushConfig()` returns null → push silently skipped. The public key is the **only `NEXT_PUBLIC_` env** (the browser needs it to `pushManager.subscribe`; it's non-secret). Server send + payload localization live in [src/lib/webpush.ts](src/lib/webpush.ts) (`sendPush` is **best-effort, prunes 404/410 dead subs**; `buildPushPayload` localizes per recipient locale reusing the `notifications` i18n namespace, like email templates) and are wired into [notify()](src/lib/notify.ts)'s fan-out (same 3 triggers; push is always immediate, ignores `notifyByEmail`). Subscriptions live in the [PushSubscription](src/models/PushSubscription.ts) model (per-user, `endpoint` unique) — **the subscription itself is the opt-in** (no User-level flag); managed via [push.actions.ts](src/actions/push.actions.ts) + the [usePushNotifications](src/hooks/usePushNotifications.ts) hook + the settings notification card. Every push **must** call `showNotification` (the `userVisibleOnly` contract); after showing, the SW `postMessage`s open tabs so [useNotificationPushSync](src/hooks/queries/useNotifications.ts) invalidates the bell badge instantly (60s polling stays as the no-push fallback). iOS Safari needs the PWA installed (Add to Home Screen) before push works — the hook detects this (`needsInstall`) and the UI guides instead of silently disabling.

### Travel map & sharing
The travel map ([src/app/[locale]/map/](src/app/%5Blocale%5D/map/), components in [src/components/map/](src/components/map/)) has three modes — routes (great-circle arcs), heat (leaflet.heat over itinerary-day `location`s), and countries (choropleth). Notes that aren't obvious from the code:
- **Leaflet is client-only**: always load the canvas via `dynamic(..., { ssr: false })`, and keep `.leaflet-container { isolation: isolate; }` in [globals.css](src/app/globals.css) — Leaflet's panes/controls use z-index 200–1000 and otherwise escape the root stacking context (dialogs/dropdowns get covered).
- **`User.mapShareCode`** is the per-user analog of a trip's `hash_code`: opt-in, sparse-unique, powers the public map share. Same hash format/validation (`isValidHashCode`), so `/map/share/*` is public (not in `proxy.ts` `protectedRoutes`).
- **Public map API ([/api/public/map/[code]](src/app/api/public/map/%5Bcode%5D/route.ts)) is de-identified by contract**: it exposes coordinates, localized place names, and **year only** — never trip names, ids, or full dates. Year is the deliberate exception (needed for the year filter); do not start returning dates. Heat is aggregated to rounded coords so individual days aren't recoverable.
- **`public/geo/countries.geojson` is a generated asset, not hand-edited**: a trimmed Natural Earth 110m admin-0 set (props reduced to `iso_a2` + localized names, coords rounded to 2 dp). Regenerate from `nvkelso/natural-earth-vector` if country borders/names need updating. It's fetched lazily (only in countries mode) and module-cached in [CountriesLayer.tsx](src/components/map/CountriesLayer.tsx).

### Internationalization
next-intl in **"without i18n routing"** mode — **URLs carry no locale prefix** (no `/en`, `/jp`, `/zh-CN`); pages live directly under [src/app/](src/app/), not a `[locale]` segment. Locales: `en`, `zh`, `zh-CN`, `jp`; default `zh`. The UI locale is resolved **server-side from the `NEXT_LOCALE` cookie** in [src/i18n/config.ts](src/i18n/config.ts) `getRequestConfig` (cookie, not localStorage, so SSR's first paint is correct — localStorage isn't sent to the server). [src/i18n/routing.ts](src/i18n/routing.ts) is now just the `locales`/`defaultLocale`/`Locale` constants (no `defineRouting`), and there is **no i18n middleware** — [src/proxy.ts](src/proxy.ts) only does auth redirects. [src/i18n/navigation.ts](src/i18n/navigation.ts) is a thin shim re-exporting plain `next/link` + `next/navigation` (kept so existing `@/i18n/navigation` imports don't churn). Switch language via the [setLocale](src/actions/locale.actions.ts) server action (writes the cookie + `router.refresh()`); see [LanguageSwitcher](src/components/layout/LanguageSwitcher.tsx). Config in [src/i18n/](src/i18n/), message catalogs in [src/i18n/messages/](src/i18n/messages/). Add new user-facing strings to **all four** catalogs.

`User.locale` (MongoDB) is **separate** from the UI cookie: it's the locale for **server-sent Email / Web Push** (background sends can't read the cookie). `setLocale` syncs it on switch for logged-in users; keep it in Mongo.

## Conventions

- Path aliases: `@/*` → `src/*` (plus `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, `@/services`).
- Validation: Zod schemas in [src/lib/validation.ts](src/lib/validation.ts) — validate action inputs there.
- Routes and API paths: use the builders in [src/constants/routes.ts](src/constants/routes.ts) instead of hardcoding strings.
- Performance note: actions are deliberately written to avoid N+1 / extra round trips — splits/members are embedded (one `populate` instead of per-row queries), and ID resolution is folded into the membership check. Keep new DB access in the same spirit.
- Tests: Vitest + jsdom + Testing Library, `globals: true` (no need to import `describe`/`it`). Setup in [vitest.setup.ts](vitest.setup.ts).
