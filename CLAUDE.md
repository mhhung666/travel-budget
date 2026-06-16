# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Travel Budget Planner (旅行記帳) — a multi-user trip expense tracking and bill-splitting app. Next.js 16 (App Router) + React 19 + TypeScript, backed by MongoDB (Mongoose ODM). UI uses Shadcn UI (Radix) + Tailwind. Internationalized with next-intl.

## Commands

```bash
npm run dev            # Dev server (http://localhost:3000)
npm run build          # Production build
npm run lint           # ESLint (next lint); lint:fix to autofix
npm run format         # Prettier write; format:check to verify
npm test               # Vitest (watch mode)
npm run test:run       # Vitest single run (use this in CI / one-shot)
npm run test:coverage  # Coverage report (v8)
```

Run a single test file or test:
```bash
npx vitest run src/__tests__/settlement.test.ts
npx vitest run -t "test name substring"
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
Trip identifiers throughout the codebase may be either an **ObjectId string** or a public **`hash_code`** string (`[a-z0-9]{6,8}`). Resolution helpers (`getTripId`, `getTripMembership`) branch on `isValidObjectId(x)` — a 24-hex ObjectId vs the short hash code, no ambiguity. Preserve this dual-acceptance when adding endpoints.

### Schema changes
Schemas are defined in [src/models/](src/models/); indexes are created by Mongoose on connect (`autoIndex`). Changing a field or index = editing the model. ID-shaped fields are ObjectId strings end-to-end (JWT, DTOs, frontend props).

For **reproducible** index/structure changes and data backfills there is also `migrate-mongo`: config in [migrate-mongo-config.js](migrate-mongo-config.js) (ESM, reads `MONGODB_URI`), scripts in [migrations/](migrations/), run via `npm run migrate:status|up|down|create`. `autoIndex` stays on; migrations coexist with it (idempotent, index names aligned). See [docs/MIGRATIONS.md](docs/MIGRATIONS.md). There are no SQL migration files.

### Settlement
[src/lib/settlement.ts](src/lib/settlement.ts) — greedy creditor/debtor matching to minimize transfer count. Uses a `0.01` epsilon for float comparison. Covered by [src/__tests__/settlement.test.ts](src/__tests__/settlement.test.ts).

### Internationalization
next-intl with `[locale]` route segment. Locales: `en`, `zh`, `zh-CN`, `jp`; default `zh`; `localePrefix: 'as-needed'` (default locale has no prefix). Config in [src/i18n/](src/i18n/), message catalogs in [src/i18n/messages/](src/i18n/messages/). Add new user-facing strings to **all four** catalogs. Use the navigation helpers from [src/i18n/navigation.ts](src/i18n/navigation.ts) for locale-aware links.

## Conventions

- Path aliases: `@/*` → `src/*` (plus `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, `@/services`).
- Validation: Zod schemas in [src/lib/validation.ts](src/lib/validation.ts) — validate action inputs there.
- Routes and API paths: use the builders in [src/constants/routes.ts](src/constants/routes.ts) instead of hardcoding strings.
- Performance note: actions are deliberately written to avoid N+1 / extra round trips — splits/members are embedded (one `populate` instead of per-row queries), and ID resolution is folded into the membership check. Keep new DB access in the same spirit.
- Tests: Vitest + jsdom + Testing Library, `globals: true` (no need to import `describe`/`it`). Setup in [vitest.setup.ts](vitest.setup.ts).
