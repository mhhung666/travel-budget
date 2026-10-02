# AGENTS.md

Repository-wide instructions for coding agents.

## Workspace and boundaries

- This is the only active Travel Budget repository. Web/backend is `apps/web`, iOS/Android is
  `apps/mobile`, and pure HTTP API schemas/OpenAPI are `packages/contracts`.
- The sibling `travel-budget-mobile` is retired. Do not implement, install, or commit there.
- Read `docs/README.md` and `docs/DEVELOPMENT.md`, then the relevant application's `AGENTS.md`
  and documentation before implementation. Application-specific rules supplement these rules.
- Install with pnpm at the repository root. Commit only the root `pnpm-lock.yaml` and
  `pnpm-workspace.yaml`; use `workspace:*` for local package dependencies.
- Keep app-local scripts running in their app directory; invoke from root using pnpm filters.
- Mobile consumes versioned HTTP APIs and `@travel-budget/contracts`. Never import Web source,
  Next.js Server Actions, Mongoose, or server SDKs into Mobile or contracts.
- Contracts must remain platform-independent, with no React, database, secrets, or server effects.
  Update schemas once and run `pnpm contracts:generate`; verify with `pnpm contracts:check`.
- Keep one backend, existing money/rounding/date-only rules and public/member privacy boundaries.
  AI produces editable drafts; user confirmation precedes existing write workflows.
- Preserve application-specific React/Expo compatibility. Do not force all framework versions
  to match merely because this is a workspace.
- Run affected behavior tests and required application checks. For workspace changes, validate
  root frozen install, `pnpm check`, `pnpm test:run`, `pnpm build`, and `pnpm export:check`.
  Native bundle export does not replace simulator/device tests.

## Software version and commits

- Each application's `package.json.version` is its single source of truth: `apps/web/package.json`
  and `apps/mobile/package.json`. Do not copy numeric product versions into code or documentation.
  Root workspace and private contracts are coordination packages, not product releases.
- Before creating a commit, inspect the complete deliverable. If shipped application behavior
  changes, bump the affected application's version in the same commit; releases are independent.
- Use Semantic Versioning: patch by default for fixes, UI adjustments and small compatible
  improvements; minor for compatible user-facing features; major only on explicit user request.
- Pure docs, tests, formatting, CI, dependency maintenance and behavior-preserving refactors
  normally do not bump application versions. A task with WIP commits bumps once in its final
  deliverable commit.
- Use `pnpm --filter <app> exec pnpm version patch|minor --no-git-tag-version` or run the version
  command from the application directory. Include resulting manifest/lockfile changes.
- Do not bump merely because files changed if the user did not ask for a commit, unless a new
  version is explicitly part of the task.
- Do not commit, push, tag, publish, deploy, run remote migrations, submit store builds, or
  configure remote services without a user request. Version bumps do not authorize those actions.
