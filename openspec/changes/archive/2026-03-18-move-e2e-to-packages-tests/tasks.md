## 1. Move the directory

- [x] 1.1 Run `git mv e2e packages/tests` from the monorepo root
- [x] 1.2 Confirm `packages/tests/` contains all subdirectories (fixtures, scripts, tests, global-setup.ts, vitest.config.ts, tsconfig.json, package.json, README.md)

## 2. Fix helpers.ts MASON_BIN path

- [x] 2.1 In `packages/tests/tests/helpers.ts`, update `MASON_BIN` from `path.join(PROJECT_ROOT, "bin", "mason.js")` to `path.join(PROJECT_ROOT, "scripts", "mason.js")` — also fixed `PROJECT_ROOT` depth (`"../.."` instead of `".."`)
- [x] 2.2 Remove or update the `@deprecated` comment on `CHAPTER_BIN` if it still references `bin/`

## 3. Update root package.json workspaces

- [x] 3.1 In root `package.json`, remove the `"e2e"` entry from the `workspaces` array (it is now covered by `"packages/*"`)
- [x] 3.2 Run `npm install` from the monorepo root to re-link the workspace and confirm `@clawmasons/e2e` is still resolvable

## 4. Update CLAUDE.md

- [x] 4.1 In `CLAUDE.md`, update the e2e verification command from `cd /Users/greff/Projects/clawmasons/chapter/e2e` to `cd /Users/greff/Projects/clawmasons/chapter/packages/tests`

## 5. Update .claude rules

- [x] 5.1 In `.claude/rules/e2e-tests.md`, update the path glob from `e2e/**/*` to `packages/tests/**/*`

## 6. Update openspec spec

- [x] 6.1 In `openspec/specs/e2e/spec.md`, update all path references from `e2e/tests/` to `packages/tests/tests/`
- [x] 6.2 Update the verification commands block: `cd e2e && npx vitest run` → `cd packages/tests && npx vitest run`
- [x] 6.3 Update the no-internal-imports grep command: `grep -r "../../packages/" e2e/tests/` → `grep -r "../../packages/" packages/tests/tests/`

## 7. Update documentation

- [x] 7.1 In `docs/development.md`, update the directory tree entry `e2e/` → `packages/tests/`
- [x] 7.2 In `docs/development.md`, update all `cd e2e` commands → `cd packages/tests`
- [x] 7.3 In `docs/development.md`, update the link `e2e/README.md` → `packages/tests/README.md`
- [x] 7.4 In `docs/development.md`, update the inline e2e test run commands (`cd e2e && npx vitest run`)
- [x] 7.5 Search all other `docs/*.md` and `README.md` for `e2e/` or `e2e` and update any remaining references (also updated openspec/specs: mcp-test-agent, mcp-agent-package, cli-binary-rename, e2e/spec.md)

## 8. Verify

- [x] 8.1 Run `npm install` from the monorepo root and confirm no workspace errors
- [x] 8.2 Run `cd packages/tests && npx vitest run --config vitest.config.ts` — 69/73 pass; 4 failures (acp-client-spawn x3, mcp-proxy-agent x1) are pre-existing infrastructure issues unrelated to the move
- [x] 8.3 `packages/tests` typechecks clean; root-level TS error in packages/cli/tests/cli/package.test.ts is pre-existing
- [x] 8.4 Confirm `grep -r "../../packages/" packages/tests/tests/` returns no matches — PASS
