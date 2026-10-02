# AGENTS.md

Instructions for the Web application and business backend in `apps/web`. Also follow the
repository-wide [AGENTS.md](../../AGENTS.md).

## Version and documentation

- Follow the root version, commit, and documentation rules; Web releases independently.
- This application's `package.json.version` is its product version source.
- Update the root [changelog.md](../../changelog.md) for every development task; keep entries brief.

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
