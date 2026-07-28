# AGENTS.md

Repository-wide instructions for coding agents.

## Software version and commits

- `package.json.version` is the single source of truth for the application version. Do not copy a
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
- Run `pnpm version patch|minor --no-git-tag-version` to bump the version. Include the resulting
  manifest/lockfile changes in the same commit.
- A version bump never authorizes creating a Git tag, publishing a release, pushing, or deploying.
- If the user did not ask the agent to commit, do not bump merely because files were edited, unless
  the task explicitly requires delivering a new version.
