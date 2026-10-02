# AGENTS.md

Instructions for the Web application and business backend in `apps/web`. Also follow the
repository-wide [AGENTS.md](../../AGENTS.md).

## Software version and commits

- This directory's `package.json.version` is the single source of truth for the Web application
  version. The Mobile application releases independently. Do not copy a numeric version into source
  code or documentation.
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
- Run `pnpm version patch|minor --no-git-tag-version` from `apps/web` to bump the version. Include
  the resulting manifest/lockfile changes in the same commit.
- A version bump never authorizes creating a Git tag, publishing a release, pushing, or deploying.
- If the user did not ask the agent to commit, do not bump merely because files were edited, unless
  the task explicitly requires delivering a new version.

## Workspace and backend boundaries

- Package name: `@travel-budget/web`. Install dependencies from the repository root using its
  shared `pnpm-lock.yaml`; add Web dependencies with `pnpm --filter @travel-budget/web add`.
- Run Web scripts from `apps/web`, or use `pnpm --filter @travel-budget/web <script>` from the
  repository root. Use Node.js 24. Migrations, environment files and generated Web assets remain
  local to this application.
- Web owns MongoDB models, migrations, authorization, final writes and external service SDKs.
  `apps/mobile` consumes versioned HTTP APIs; never expose server modules through shared packages.
- API DTOs and runtime schemas live in `packages/contracts/src/index.ts` and are imported as
  `@travel-budget/contracts`. `src/lib/mobile/contract.ts` is only a thin adapter.
- `packages/contracts/openapi.json` is the canonical API artifact. Run `pnpm contracts:generate`
  and `pnpm contracts:check` from the repository root after changing contracts.
- Read `docs/README.md`, `docs/ARCHITECTURE.md`, and `docs/MOBILE_API.md` for backend integrations.
  Preserve existing member/public boundaries, money calculations, dates and Web cookie semantics.
- Keep `build` on `next build --webpack` so Serwist generates the PWA service worker. Vercel
  must use Root Directory `apps/web` with outside-root source files included; preserve cron routes.
