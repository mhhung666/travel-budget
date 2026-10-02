# CLAUDE.md

Travel Budget is a pnpm monorepo. Follow [AGENTS.md](AGENTS.md) and [workspace development](docs/DEVELOPMENT.md).

- `apps/web`: Next.js Web and the single business backend. Read [Web rules](apps/web/CLAUDE.md)
  and [Web docs](apps/web/docs/README.md) before touching business services, models or migrations.
- `apps/mobile`: Expo iOS/Android client. Read [Mobile rules](apps/mobile/AGENTS.md)
  and [Mobile docs](apps/mobile/docs/README.md) before implementing Native features.
- `packages/contracts`: pure Zod/TypeScript API schemas and one generated OpenAPI artifact.

Install at root with `pnpm install`. Root `pnpm dev` starts Web; `pnpm dev:mobile` starts Expo.
Use `pnpm --filter @travel-budget/web <script>` for Web-specific tools and migrations.
Required workspace validation: `pnpm check`, `pnpm test:run`, `pnpm build`, `pnpm export:check`.
The retired sibling `travel-budget-mobile` is only for history; all active work belongs here.
