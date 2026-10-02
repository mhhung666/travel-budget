# AGENTS.md

Instructions for coding agents working in `apps/mobile`. Also follow the repository root `AGENTS.md`.

## Software version and commits

- `apps/mobile/package.json.version` is the single source of truth for the mobile application version. Do not copy a
  numeric version into source code or documentation.
- Before creating a commit, inspect the complete deliverable represented by that commit. If it
  changes shipped application behavior, bump the version in the same commit.
- Use Semantic Versioning:
  - `patch` (default): bug fixes, UI adjustments, and small backward-compatible improvements.
  - `minor`: backward-compatible user-facing features.
  - `major`: breaking or major product changes; only when the user explicitly requests it.
- Pure documentation, test-only, formatting, CI, dependency-maintenance, and behavior-preserving
  refactor commits do not normally bump the application version.
- For a task split across multiple work-in-progress commits, bump exactly once in the final
  deliverable commit rather than once per intermediate commit.
- Run `pnpm version patch|minor --no-git-tag-version` from `apps/mobile` to bump the version. Include the resulting
  manifest/lockfile changes in the same commit.
- A version bump never authorizes creating a Git tag, publishing a release, pushing, or deploying.
- If the user did not ask the agent to commit, do not bump merely because files were edited, unless
  the task explicitly requires delivering a new version.

## Mobile project scope

- This workspace is the iOS / Android client. `apps/web` in this repository owns the existing
  Next.js Web app, business backend, MongoDB models, migrations, and external services.
- Read `docs/README.md`, `docs/ARCHITECTURE.md`, and `docs/DEVELOPMENT.md` before implementing features.
  Read `docs/BACKEND_CONTRACT.md` for integrations. Planned APIs are not existing capabilities.
- The version policy above is inherited from the repository root `AGENTS.md`. This independently
  released mobile app owns its own `package.json.version`; `app.config.ts` imports it. The root
  private package coordinates workspaces and has no product version. Native build numbers are
  separate counters. Do not copy the Web application version.
- Never import `apps/web` source, Next.js Server Actions, Mongoose, or server SDKs into this app.
  Consume versioned HTTP APIs. The backend alone owns authorization and final writes.
- Import shared runtime DTO schemas and types through `@travel-budget/contracts`. Their single
  source is `packages/contracts/src/index.ts`; OpenAPI is `packages/contracts/openapi.json`.
  Run `pnpm contracts:generate` from the repository root after schema changes, then
  `pnpm contracts:check`. Do not maintain a separate mobile schema or OpenAPI copy.
- Keep `src/app` thin. Put screens and feature hooks in `src/features`, transport in `src/api`,
  platform persistence in `src/storage`, and shared UI tokens in `src/theme`.
- Use pnpm, TypeScript strict, and the committed formatter configuration. Install workspace
  dependencies from the repository root. Install native packages from `apps/mobile` with
  `pnpm exec expo install`; preserve Expo / React Native / React compatibility.
- New user-facing strings must support `zh`, `zh-CN`, `en`, and `jp`. Map device `ja` to `jp`.
  Use semantic color tokens and respect safe areas, text scaling, and accessible labels.
- Preserve existing TWD base amounts, cent rounding, stable split allocation, date-only values,
  member/public data boundaries, and server validation. Do not invent another settlement algorithm.
- AI produces drafts only; the user confirms before existing write workflows run.
- Never store tokens in query caches or plain preferences. Refresh credentials belong in
  SecureStore. `EXPO_PUBLIC_*` is public bundle data; no database, R2, AI, or signing secrets.
- Future durable outbox records must be isolated by account/environment, retain one request ID
  across retries, and survive cache invalidation. Expired authentication pauses synchronization.
- Run `pnpm check` and `pnpm export:check` from `apps/mobile` for app changes, plus focused behavior
  tests. Run the root `pnpm contracts:check` for contract changes. Native bundle export does not
  replace simulator/device tests.
- Keep current capabilities in `docs/FEATURES.md`; put unfinished work in `docs/ROADMAP.md`.
  Do not label planned auth, offline storage, or APIs as implemented.
- Do not create commits, push, publish, submit store builds, or configure remote services without
  a user request. Routine local implementation and checks do not require an extra approval.
