## 1. Create fixture directory

- [x] 1.1 Create `packages/tests/fixtures/project-role/package.json` with minimal content
- [x] 1.2 Create `packages/tests/fixtures/project-role/.claude/commands/review.md`
- [x] 1.3 Create `packages/tests/fixtures/project-role/.claude/skills/testing/SKILL.md`
- [x] 1.4 Create `packages/tests/fixtures/project-role/.claude/settings.json` with an MCP server
- [x] 1.5 Create `packages/tests/fixtures/project-role/.codex/instructions/setup.md`
- [x] 1.6 Create `packages/tests/fixtures/project-role/.mason/roles/writer/ROLE.md` for source-override test

## 2. Create e2e test file

- [x] 2.1 Create `packages/tests/tests/project-role.test.ts` with imports and workspace setup helpers
- [x] 2.2 Add test: invalid `--source` value exits with error listing available sources
- [x] 2.3 Add test: missing source directory exits with clear error message
- [x] 2.4 Add test: empty source directory warns but proceeds (fails at Docker check, not source validation)
- [x] 2.5 Add test: implied alias routes `mason codex` to run command (proves routing by error type)
- [x] 2.6 Add test: `--role` with `--source` override is accepted by CLI (fails at Docker, not validation)
- [x] 2.7 Add Docker-guarded tests for zero-config, cross-source, and multi-source scenarios

## 3. Verification

- [x] 3.1 Run `npx tsc --noEmit` — compiles without errors
- [x] 3.2 Run `npx vitest run packages/shared/tests/` — all 238 tests pass (11 files)
- [x] 3.3 Run `npx vitest run packages/cli/tests/` — all 662 tests pass (34 files)
- [x] 3.4 Run `cd packages/tests && npx vitest run --config vitest.config.ts` — 9 e2e tests pass (1 file)
