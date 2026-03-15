## 1. Schema: Add sources field to RoleType

- [x] 1.1 Add `sources` optional string array (default `[]`) to `roleTypeSchema` in `packages/shared/src/schemas/role-types.ts`
- [x] 1.2 Verify `RoleType` TypeScript type now includes `sources: string[]`
- [x] 1.3 Update `role-types.test.ts` — add scenarios: valid sources, sources defaults to empty, sources empty array is valid

## 2. Discovery: Narrow local role search to .mason/roles/

- [x] 2.1 Update `discoverLocalRoles()` in `packages/shared/src/role/discovery.ts` to scan `.mason/roles/*/ROLE.md` instead of `.<agent>/roles/*/ROLE.md` across all dialect directories
- [x] 2.2 Update `findLocalRole()` in the same file to look at `.mason/roles/<name>/ROLE.md` only
- [x] 2.3 Remove the import of `getKnownDirectories` from `dialect-registry.ts` in `discovery.ts` (no longer needed for local discovery)
- [x] 2.4 Update `role-discovery.test.ts` — replace `.claude/roles/` fixture paths with `.mason/roles/`; add scenario asserting that `.claude/roles/` is NOT searched; add scenario for `.mason/roles/` discovery; remove tests that specifically test per-dialect discovery (`.codex/roles/`, `.aider/roles/`)

## 3. New mason package command

- [x] 3.1 Create `packages/cli/src/cli/commands/package.ts` with `registerPackageCommand(program: Command)` export
- [x] 3.2 Implement role loading: read ROLE.md from `.mason/roles/<name>/ROLE.md`; fail with clear error if not found
- [x] 3.3 Implement dialect-aware source scanning: given a `sources` entry, check if it matches a known dialect directory; if so, scan the dialect-specific subdirectory for each resource type (tasks→commands dir, skills→skills dir, apps→mcp config)
- [x] 3.4 Implement ref validation: resolve every task, skill, and app ref from sources dirs; collect all unresolved refs; report all at once and exit non-zero if any are missing (write no files)
- [x] 3.5 Implement build directory assembly: create `.mason/roles/<name>/build/`; copy ROLE.md; copy resolved task files to `build/tasks/`, skill files to `build/skills/`, app configs to `build/apps/`
- [x] 3.6 Implement `package.json` generation: if `.mason/roles/<name>/package.json` exists, merge with generated fields (`chapter: { type: "role" }`, `files`); otherwise generate from ROLE.md metadata
- [x] 3.7 Implement npm lifecycle: spawn `npm install` in build dir; if `build` script exists in package.json spawn `npm run build`; spawn `npm pack`; stop and report on any non-zero exit
- [x] 3.8 Print path to generated `.tgz` file on success

## 4. Remove deprecated commands

- [x] 4.1 Delete `packages/cli/src/cli/commands/add.ts`
- [x] 4.2 Delete `packages/cli/src/cli/commands/pack.ts`
- [x] 4.3 Delete `packages/cli/src/cli/commands/mason-init-repo.ts`
- [x] 4.4 Remove `registerAddCommand`, `registerPackCommand`, and `registerMasonInitRepoCommand` imports and call sites from `packages/cli/src/cli/commands/index.ts`
- [x] 4.5 Register `registerPackageCommand` in `packages/cli/src/cli/commands/index.ts` under the top-level program (not under `chapter` or `mason` subcommands)

## 5. Update .mason/.gitignore

- [x] 5.1 Add `roles/**/build` and `roles/**/dist` entries to `.mason/.gitignore` (create the file if it does not exist)

## 6. Tests for the package command

- [x] 6.1 Create `packages/cli/tests/package-command.test.ts`
- [x] 6.2 Test: role found at `.mason/roles/<name>/ROLE.md` → proceeds to build
- [x] 6.3 Test: role not found → exits non-zero with path in error message
- [x] 6.4 Test: missing task ref → exits non-zero, reports unresolved ref, no files written
- [x] 6.5 Test: multiple missing refs → all reported in single error output
- [x] 6.6 Test: Claude dialect source resolves tasks from `commands/` subdirectory
- [x] 6.7 Test: build dir created with correct structure (ROLE.md, tasks/, skills/)
- [x] 6.8 Test: user-supplied `.mason/roles/<name>/package.json` merged into generated `build/package.json`
- [x] 6.9 Test: generated `package.json` from scratch when no user file exists
- [x] 6.10 Test: `npm run build` skipped when no `build` script in package.json
- [x] 6.11 Delete or update tests in `packages/cli/tests/` that cover `add`, `pack`, or `mason-init-repo` commands

## 7. Update e2e fixtures and tests

- [x] 7.1 Move role fixtures from `e2e/fixtures/test-chapter/.claude/roles/` to `e2e/fixtures/test-chapter/.mason/roles/`
- [x] 7.2 Move role fixtures from `e2e/fixtures/claude-test-project/.claude/roles/` to `e2e/fixtures/claude-test-project/.mason/roles/` (if present)
- [x] 7.3 Update `e2e/tests/role-workflow.test.ts` — change fixture path references from `.claude/roles/` to `.mason/roles/`
- [x] 7.4 Update `e2e/tests/build-pipeline.test.ts` — change fixture path references
- [x] 7.5 Update `e2e/tests/mcp-proxy.test.ts` — change fixture path references
- [x] 7.6 Update `e2e/tests/cross-agent-materialization.test.ts` — update test description and fixture path; verify role in `.mason/roles/` is discovered regardless of target agent dialect

## 8. Verification

- [x] 8.1 Run `npx tsc --noEmit` — zero type errors
- [x] 8.2 Run `npx eslint src/ tests/` — zero lint errors in affected packages
- [x] 8.3 Run `npx vitest run` in `packages/shared` — all discovery and role-types tests pass
- [x] 8.4 Run `npx vitest run` in `packages/cli` — all package command tests pass, removed command tests deleted
- [x] 8.5 Run e2e tests — `cd e2e && npx vitest run --config vitest.config.ts`
