## Context

The monorepo currently has `e2e/` as a top-level directory alongside `packages/`. This is an outlier: every other testable unit (unit tests, integration tests) lives under `packages/`. The `e2e/` directory is already structured like a package (it has its own `package.json`, `tsconfig.json`, and `vitest.config.ts`) but it sits outside the `packages/` tree and is registered as an explicit workspace entry instead of being covered by the `packages/*` glob.

A prior commit also moved `bin/mason.js` to `scripts/mason.js`, but `e2e/tests/helpers.ts` still references the old `bin/` path.

## Goals / Non-Goals

**Goals:**
- Move `e2e/` to `packages/tests/` with no behavioral changes to the tests themselves
- Fix the stale `bin/mason.js` reference in `helpers.ts` to `scripts/mason.js`
- Update all documentation and config files that reference `e2e/`
- Leave the workspace auto-discoverable via the existing `packages/*` glob (remove the explicit `"e2e"` workspace entry)

**Non-Goals:**
- Changing test logic, adding test coverage, or restructuring test files internally
- Renaming the npm package from `@clawmasons/e2e` (keep as-is to avoid churn in any external references)
- Migrating the test suite to a different runner or config format

## Decisions

### Decision 1: Move is a rename, not a copy-then-delete
Use `git mv e2e packages/tests` to preserve file history. This is preferable to creating a new directory and deleting the old one, which loses `git log --follow` traceability.

**Alternative considered:** Copy + delete. Rejected because it breaks `git log --follow` on test files.

### Decision 2: Keep package name `@clawmasons/e2e`
The npm package name in `packages/tests/package.json` stays `@clawmasons/e2e`. The directory name and package name don't need to match, and renaming the package risks breaking any internal references to `@clawmasons/e2e` that exist in other packages.

**Alternative considered:** Rename to `@clawmasons/tests`. Rejected because it adds unnecessary churn (auditing all consumers) for a relocation task.

### Decision 3: Remove explicit `"e2e"` workspace entry from root `package.json`
After the move, `packages/tests` is covered by the `packages/*` glob already in the workspaces array. The explicit `"e2e"` entry must be removed or it will reference a non-existent directory.

### Decision 4: Fix `MASON_BIN` in `helpers.ts` at the same time
`helpers.ts` line 19 references `bin/mason.js` which no longer exists. This is a pre-existing bug that would cause every test to fail. Fix it as part of this move since the file is already being touched.

The path computation is:
```
E2E_ROOT  = resolve(__dirname, "..")   // → packages/tests
PROJECT_ROOT = resolve(E2E_ROOT, "..")  // → monorepo root (unchanged after move)
MASON_BIN = join(PROJECT_ROOT, "scripts", "mason.js")  // ✓ correct
```

No depth change needed — after the move, `E2E_ROOT` still resolves to the package dir and `PROJECT_ROOT` still resolves to the monorepo root.

## Risks / Trade-offs

- **`tmp/` directory**: `e2e/tmp/` is gitignored and holds test run artifacts. It will not be moved by `git mv`; it can be left to be recreated at `packages/tests/tmp/` on the next test run. → No mitigation needed.
- **CI/CD paths**: Any CI scripts (GitHub Actions, etc.) that run `cd e2e && ...` must be updated. → Covered in tasks; search for `e2e` in `.github/` during implementation.
- **node_modules symlinks**: After the move, run `npm install` from the monorepo root to re-link the workspace. → Standard workspace re-link, no special steps.
- **Stale `@pe2e/AGENTS.md` reference**: `.claude/rules/e2e-tests.md` uses `@pe2e/AGENTS.md` which is a path alias. The path glob `e2e/**/*` → `packages/tests/**/*` must be updated so the rule fires correctly.

## Migration Plan

1. `git mv e2e packages/tests`
2. Update `packages/tests/tests/helpers.ts`: `bin/mason.js` → `scripts/mason.js`
3. Update root `package.json` workspaces: remove `"e2e"`, confirm `packages/*` covers `packages/tests`
4. Update `CLAUDE.md`: e2e path in verification command
5. Update `.claude/rules/e2e-tests.md`: path glob `e2e/**/*` → `packages/tests/**/*`
6. Update `openspec/specs/e2e/spec.md`: path references and verification commands
7. Search and update `docs/`, `README.md`, and any other `*.md` referencing `e2e/`
8. Run `npm install` to re-link the workspace
9. Run `cd packages/tests && npx vitest run` to verify tests still pass
