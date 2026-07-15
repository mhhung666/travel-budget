# CLAUDE.md

Guidance for Claude Code in this repo. **This file is an index + hard rules only (keep ≤150 lines).**
Detail lives in the linked docs — open the one matching your task; do not paste their content back in here.

## Overview

Travel Budget Planner (旅行記帳) — multi-user trip expense tracking and bill-splitting.
Next.js 16 (App Router) + React 19 + TypeScript, MongoDB (Mongoose), Shadcn UI (Radix) + Tailwind, next-intl.
Primary backend = **Server Actions** in [src/actions/](src/actions/), not REST. `/api` only hosts the
intentionally-public share endpoints and the exchange-rate proxy.

## Commands

```bash
pnpm dev               # Dev server (http://localhost:3000), Turbopack
pnpm build             # Production build — `next build --webpack` (Serwist needs webpack; see hard rules)
pnpm lint              # ESLint; lint:fix to autofix
pnpm format            # Prettier write; format:check to verify
pnpm test:run          # Vitest single run (CI / one-shot); `pnpm test` = watch mode
pnpm test:coverage     # Coverage (v8)
pnpm vitest run src/__tests__/settlement.test.ts   # single file; `-t "name"` for one test
pnpm migrate:status|up|down|create                 # migrate-mongo (docs/MIGRATIONS.md)
npx tsc --noEmit                                   # type check (no pnpm script for this)
```

## Hard rules

**Data & auth**
- Actions return `ActionResult<T>` ([src/actions/types.ts](src/actions/types.ts)); never throw across the
  action boundary; error `code` from `ErrorCodes` (frontend maps codes to i18n messages).
- `await dbConnect()` before any DB access. There is **no RLS** — every action touching trip data must call
  `getTripMembership(userId, tripIdOrCode)` ([src/lib/permissions.ts](src/lib/permissions.ts)) itself.
- No FK/storage cascade: deleting a trip manually deletes expenses + itinerary days; R2 blob deletes are
  best-effort (log, never fail the user action).
- Trip ids are ObjectId string **or** `hash_code` (`[a-z0-9]{6,10}`) — keep dual acceptance in new endpoints,
  **except** `/api/public/*` which accepts hash_code only (deliberate).
- NEVER add session checks to [src/app/api/public/](src/app/api/public/) — unauthenticated by design.
- NEVER return receipt attachments on public routes (`toExpenseDto(..., { attachments: false })`);
  receipts live in the private bucket only, avatars in the public one.
- Album photos (`photos/<tripId>/`): the display `<uuid>.jpg` **carries live GPS EXIF by design**
  ([FEATURES.md](docs/FEATURES.md) §17). Any public/unauthenticated album route may sign only the
  sanitized `<uuid>_p.jpg` (APP1 stripped) and `<uuid>_t.webp` — **never** the `.jpg`; and its DTO
  must never carry `location`/`place`/`exif`. Members-only today (no public route yet) — keep it that way until Phase 4.
- `MONGODB_URI` never gets `NEXT_PUBLIC_`; the only `NEXT_PUBLIC_` env is the VAPID public key.

**Build & PWA**
- `pnpm build` must stay `next build --webpack` — Turbopack **silently** skips Serwist (no sw.js). Never revert.
- NEVER read/edit/lint `public/sw.js` (gitignored build artifact) — edit [src/sw.ts](src/sw.ts).
  Verify PWA/SW behavior with `pnpm build && pnpm start`; the SW is disabled in `pnpm dev`.
- The SW must NOT cache server-action POSTs or `/api/*` mutations.
- Bump `PERSIST_BUSTER` ([src/lib/queryPersister.ts](src/lib/queryPersister.ts)) when the persisted query
  cache shape/keys change.

**i18n**
- New user-facing strings go to **all four** catalogs (`en`, `zh`, `zh-CN`, `jp`) in
  [src/i18n/messages/](src/i18n/messages/). Verify: `grep -l "<key>" src/i18n/messages/*.json` → 4 files.
- URLs carry **no locale prefix** (no `[locale]` segment); UI locale = `NEXT_LOCALE` cookie read server-side.
  No i18n middleware — [src/proxy.ts](src/proxy.ts) does auth redirects only.

**Misc**
- NEVER hand-edit `public/geo/countries.geojson` (generated) or read `pnpm-lock.yaml` / catalog JSONs whole.
- Leaflet is client-only: `dynamic(..., { ssr: false })`; keep `.leaflet-container { isolation: isolate; }`
  in [globals.css](src/app/globals.css).
- Public map API returns coords / localized place names / **year only** — never trip names, ids, full dates.
- Reshaping a stored field → write a migrate-mongo migration (idempotent + `down`) first; no lingering
  read-side `newField ?? legacyField` fallbacks. Other environments need `pnpm migrate:up` — say so.
- Existing code that "looks like a bug" may be deliberate — check
  [docs/claude/DIAGNOSIS.md](docs/claude/DIAGNOSIS.md) §3 before "fixing" it.

## Read-before-touching map

| Touching… | Read first |
|---|---|
| Server actions, models, auth, permissions | [docs/claude/ARCH-NOTES.md](docs/claude/ARCH-NOTES.md) §Server Actions / §Auth / §tripIdOrCode |
| Schema / migrations | ARCH-NOTES §Schema + [docs/MIGRATIONS.md](docs/MIGRATIONS.md) |
| Receipts, avatars, uploads (R2) | ARCH-NOTES §R2 blob 儲存 |
| Offline / service worker / query persistence | ARCH-NOTES §離線 PWA |
| Notifications / web push / email | ARCH-NOTES §Web Push |
| Map pages & public map share | ARCH-NOTES §旅遊地圖 |
| i18n / locale switching | ARCH-NOTES §國際化 |
| Settlement / payments math | ARCH-NOTES §結算 + [src/lib/settlement.ts](src/lib/settlement.ts) |

## Docs index

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — authoritative system structure (subsystems, data model)
- [docs/FEATURES.md](docs/FEATURES.md) — shipped features inventory (incl. friends system §15)
- [docs/ROADMAP.md](docs/ROADMAP.md) — not-yet-built ideas · [docs/CHANGELOG.md](docs/CHANGELOG.md) — done log
- [docs/IMPROVEMENTS.md](docs/IMPROVEMENTS.md) — known tech debt
- [docs/MIGRATIONS.md](docs/MIGRATIONS.md) — migrate-mongo guide

## Working protocol (read before non-trivial tasks)

- **Delegation & model choice**: [docs/claude/DISPATCH.md](docs/claude/DISPATCH.md) — main thread orchestrates;
  repo scans, batch edits, verification go to cheap subagents with explicit `model`.
- **Definition of done / when to ask / escalation**: [docs/claude/JUDGMENT.md](docs/claude/JUDGMENT.md) —
  open the §2 checklist matching your task type *before* starting; verify with grep, not memory.
- **Delegation prompt templates**: [docs/claude/PROMPTS.md](docs/claude/PROMPTS.md).
- **Known failure modes** (token leaks, focus loss, deliberate-design traps): [docs/claude/DIAGNOSIS.md](docs/claude/DIAGNOSIS.md).
- **Maintaining these docs + lessons log**: [docs/claude/MAINTENANCE.md](docs/claude/MAINTENANCE.md),
  [docs/claude/LESSONS.md](docs/claude/LESSONS.md) — append a lesson after any correction from the user.

## Conventions

- Path aliases `@/*` → `src/*` (plus `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, `@/services`).
- Validate action inputs with Zod schemas in [src/lib/validation.ts](src/lib/validation.ts).
- Use route/API-path builders in [src/constants/routes.ts](src/constants/routes.ts); no hardcoded strings.
- Avoid N+1: members/splits are embedded, one `populate`, ID resolution folded into the membership check —
  keep new DB access in that spirit.
- Tests: Vitest + jsdom + Testing Library, `globals: true`; setup in [vitest.setup.ts](vitest.setup.ts).
