## Why

The `e2e/` directory lives outside the monorepo's `packages/` tree, making it inconsistent with how the rest of the project is organized. Moving it to `packages/tests/` unifies all testable units under one root, and gives the test suite a proper home as the canonical location for CLI-driven integration and system-level tests.

## What Changes

- **BREAKING**: `e2e/` directory moved to `packages/tests/`
- All relative paths inside the e2e suite adjusted for the one extra directory level (e.g., fixture references, tsconfig paths, vitest config root)
- References to `bin/mason.js` in test helpers/scripts updated to `scripts/mason.js` (already moved in a prior commit)
- Documentation updated: `README.md`, `docs/**`, any `spec.md` files, and `CLAUDE.md` / `.claude/**/*.md` files that reference the `e2e/` path
- CI and script invocations that reference `cd e2e && ...` updated to `cd packages/tests && ...`

## Capabilities

### New Capabilities

_(none — this is a relocation, no new capabilities are introduced)_

### Modified Capabilities

- `e2e`: Spec references paths (`e2e/tests/`, `e2e/vitest.config.ts`, `cd e2e`) that will change to `packages/tests/tests/`, `packages/tests/vitest.config.ts`, `cd packages/tests`. Verification commands need updating.

## Impact

- `e2e/` → `packages/tests/` (directory rename/move)
- `e2e/scripts/` or any helper that resolves the mason binary path (`bin/mason.js` → `scripts/mason.js`)
- `packages/tests/tsconfig.json` — `rootDir`/`baseUrl` relative paths shift by one level
- `packages/tests/vitest.config.ts` — any path aliases or roots
- `CLAUDE.md` — e2e run instructions (`cd /…/chapter/e2e && npx vitest run`)
- `.claude/rules/e2e-tests.md` — path glob `e2e/**/*` → `packages/tests/**/*`
- `openspec/specs/e2e/spec.md` — verification commands and path references
- `README.md` and `docs/` — any getting-started or testing instructions
- `package.json` workspaces array (if `e2e` is listed as a workspace)
