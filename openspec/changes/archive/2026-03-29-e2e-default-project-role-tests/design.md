## Context

The existing `packages/cli/tests/e2e/project-role.test.ts` tests the project role feature with scenarios for zero-config, cross-source, multi-source, error cases, and implied alias routing. These tests use `masonExecExpectError` to invoke the CLI binary and check stdout/stderr output and exit codes.

Changes 1-4 of the default-project-role PRD added:
- Auto-creation of `.mason/roles/project/ROLE.md` on first run (CHANGE 4)
- Wildcard expansion for `tasks: ["*"]` and scoped patterns like `deploy/*` (CHANGE 2)
- Role composition via `role.includes` with circular detection (CHANGE 3)
- `tasks`/`commands` field aliasing (CHANGE 1)

These need E2E validation through the CLI.

**Key files:**
- `packages/cli/tests/e2e/project-role.test.ts` — existing E2E test file to extend
- `packages/cli/tests/e2e/fixtures/project-role/` — existing fixture with `.claude/commands/review.md`, `.claude/skills/testing/SKILL.md`
- `packages/agent-sdk/src/testing/index.ts` — shared test helpers (`masonExecExpectError`, `isDockerAvailable`)
- `packages/cli/src/cli/commands/run-agent.ts` — CLI implementation with `createDefaultProjectRole`, `loadAndResolveProjectRole`

## Goals / Non-Goals

**Goals:**
- Validate auto-creation writes `.mason/roles/project/ROLE.md` with correct template content
- Validate reuse: second run loads existing file without overwriting
- Validate wildcard expansion (bare `*` and scoped `deploy/*`) through CLI output
- Validate `commands` alias works in mason dialect ROLE.md
- Validate role includes merge correctly
- Validate circular includes produce clear error
- Validate write-failure fallback to in-memory role

**Non-Goals:**
- Testing internal APIs (those are unit tests, already covered by changes 1-3)
- Testing full Docker container builds (tests verify CLI behavior up to Docker phase)
- Testing runtime agent behavior inside the container

## Decisions

### 1. Test pattern: create workspace, run CLI, check artifacts

All tests follow this pattern:
1. Create a workspace from the `project-role` fixture (or create an empty one)
2. Optionally modify the workspace (add/edit ROLE.md, add fixture files)
3. Run `mason run --agent claude` via `masonExecExpectError`
4. Check file artifacts (`.mason/roles/project/ROLE.md` created/unchanged) and stdout/stderr output

The CLI will fail at Docker checks in most environments, but the auto-creation and role loading happens before Docker checks. So we can verify the ROLE.md was created and the CLI output does not contain source/role errors.

### 2. Fixture additions are minimal

Add only what's needed:
- `deploy/staging.md` and `deploy/production.md` under `.claude/commands/` for scoped wildcard tests
- `.mason/roles/base-role/ROLE.md` for the includes test

### 3. Docker-dependent vs Docker-independent tests

Most tests do NOT need Docker — they verify behavior that happens before Docker checks:
- Auto-creation (file is written before Docker)
- Reuse (file loaded before Docker)
- Alias recognition (parsing happens before Docker)
- Circular detection (resolution fails before Docker)
- Write-failure fallback (happens before Docker)

Docker-dependent tests (wildcard expansion observed in build output) are wrapped in `if (!isDockerAvailable()) return;`.

### 4. Write-failure test uses chmod to make directory read-only

Create the `.mason/` directory, make it read-only via `fs.chmodSync`, run the CLI, check for fallback warning. Restore permissions in cleanup.

## Test Coverage

| # | Test Scenario | Verifies | Docker Required |
|---|--------------|----------|----------------|
| 1 | Auto-creation | ROLE.md created with correct template | No |
| 2 | Reuse | Existing ROLE.md not overwritten | No |
| 3 | Wildcard all | `tasks: ["*"]` includes all tasks | No (checks file artifact) |
| 4 | Scoped wildcard | `tasks: ["deploy/*"]` scopes correctly | No (checks file content) |
| 5 | Explicit restriction | `tasks: ["review"]` restricts | No (checks file content) |
| 6 | Alias | `commands: ["*"]` works in mason dialect | No |
| 7 | Role includes | `role.includes` merges | No |
| 8 | Circular include | Error with cycle chain | No |
| 9 | Write failure fallback | Read-only dir falls back to in-memory | No |

## Detailed Test Design

### Test 1: Auto-creation
- Start with fixture that has `.claude/` but no `.mason/roles/project/ROLE.md`
- Run `mason run --agent claude`
- Assert `.mason/roles/project/ROLE.md` exists
- Assert file contains `sources:\n  - claude`, `tasks:\n  - "*"`, `skills:\n  - "*"`

### Test 2: Reuse
- Pre-create `.mason/roles/project/ROLE.md` with custom content (e.g., `tasks: ["review"]`)
- Run `mason run --agent claude`
- Assert file content unchanged (still `tasks: ["review"]`)

### Test 3: Wildcard all
- Let auto-creation happen (or use existing ROLE.md with `tasks: ["*"]`)
- Verify the auto-created ROLE.md has `tasks: ["*"]` (expansion happens at resolution time, not in the file)
- The file artifact proves the template was written correctly

### Test 4: Scoped wildcard
- Create ROLE.md with `tasks: ["deploy/*"]`
- Add `deploy/staging.md` and `deploy/production.md` to fixture
- Run CLI — verify no errors about missing tasks

### Test 5: Explicit restriction
- Create ROLE.md with `tasks: ["review"]`
- Run CLI — verify no errors

### Test 6: Alias
- Create ROLE.md with `commands: ["*"]` (mason dialect, primary = `tasks`)
- Run CLI — verify no parse error (alias recognized)

### Test 7: Role includes
- Create `.mason/roles/base-role/ROLE.md` with some tasks
- Create `.mason/roles/project/ROLE.md` with `role: { includes: ["base-role"] }`
- Run CLI — verify no error

### Test 8: Circular include
- Create `.mason/roles/project/ROLE.md` that includes `looper`
- Create `.mason/roles/looper/ROLE.md` that includes `project`
- Run CLI — verify error contains "Circular role inclusion"

### Test 9: Write failure fallback
- Create workspace with read-only `.mason/` directory (no `roles/project/` subdirectory)
- Run CLI — verify warning about fallback and no crash
