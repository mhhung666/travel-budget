# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Travel Budget Planner (旅行記帳) — a multi-user trip expense tracking and bill-splitting app. Next.js 16 (App Router) + React 19 + TypeScript, backed by Supabase (PostgreSQL). UI uses Shadcn UI (Radix) + Tailwind. Internationalized with next-intl.

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

### Auth is application-layer, not Supabase RLS
Supabase is accessed via a single **anon-key client** ([src/lib/supabase.ts](src/lib/supabase.ts)) that has no per-row security. **All authorization happens in app code** — there is no RLS to fall back on, so every action that touches trip data must verify membership itself before querying.

- Sessions: custom JWT (`jose`) stored in an httpOnly `session` cookie. See [src/lib/auth.ts](src/lib/auth.ts) (`getSession`, `createSession`, `getSessionFromRequest`). Passwords hashed with `bcryptjs`.
- Wrap actions with `withAuth(...)` ([src/actions/withAuth.ts](src/actions/withAuth.ts)) to inject a guaranteed-valid `session`, or call `getSession()` and early-return `UNAUTHORIZED`.
- Authorize trip access with `getTripMembership(userId, tripIdOrCode)` ([src/lib/permissions.ts](src/lib/permissions.ts)) — it resolves ID + checks membership + returns role in one DB round trip. Prefer it over the older `getTripId` + `isMember`/`isAdmin` helpers (kept for API routes).

### `tripIdOrCode` convention
Trip identifiers throughout the codebase may be either a **numeric DB id** or a public **`hash_code`** string. Resolution helpers (`getTripId`, `getTripMembership`) branch on `/^\d+$/`. Preserve this dual-acceptance when adding endpoints.

### Database schema lives in code, applied manually
There are **no migration files**. The canonical schema is the `INIT_SQL` string in [src/lib/supabase.ts](src/lib/supabase.ts); Postgres RPCs are in [supabase/rpc_functions.sql](supabase/rpc_functions.sql). Both must be run by hand in the Supabase SQL Editor. If you change a table or add an RPC, update these files — they are the source of truth. Core tables: `users` (real or `is_virtual`), `trips`, `trip_members` (role `admin`/`member`), `expenses`, `expense_splits`, `itinerary_days`.

### Settlement
[src/lib/settlement.ts](src/lib/settlement.ts) — greedy creditor/debtor matching to minimize transfer count. Uses a `0.01` epsilon for float comparison. Covered by [src/__tests__/settlement.test.ts](src/__tests__/settlement.test.ts).

### Internationalization
next-intl with `[locale]` route segment. Locales: `en`, `zh`, `zh-CN`, `jp`; default `zh`; `localePrefix: 'as-needed'` (default locale has no prefix). Config in [src/i18n/](src/i18n/), message catalogs in [src/i18n/messages/](src/i18n/messages/). Add new user-facing strings to **all four** catalogs. Use the navigation helpers from [src/i18n/navigation.ts](src/i18n/navigation.ts) for locale-aware links.

## Conventions

- Path aliases: `@/*` → `src/*` (plus `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, `@/services`).
- Validation: Zod schemas in [src/lib/validation.ts](src/lib/validation.ts) — validate action inputs there.
- Routes and API paths: use the builders in [src/constants/routes.ts](src/constants/routes.ts) instead of hardcoding strings.
- Performance note (see recent commits): actions are deliberately written to batch queries and avoid N+1 / extra round trips (e.g. fetch all `expense_splits` in one query, fold ID resolution into the membership check). Keep new DB access in the same spirit.
- Tests: Vitest + jsdom + Testing Library, `globals: true` (no need to import `describe`/`it`). Setup in [vitest.setup.ts](vitest.setup.ts).
