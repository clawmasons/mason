## 1. Fixtures

- [x] 1.1 Create `packages/agent-sdk/fixtures/claude-test-project/` directory structure
- [x] 1.2 Copy `package.json` from `packages/tests/fixtures/claude-test-project/`
- [x] 1.3 Copy `.claude/commands/take-notes.md`
- [x] 1.4 Copy `.claude/skills/markdown-conventions/SKILL.md`
- [x] 1.5 Copy `.mason/roles/writer/ROLE.md`

## 2. Testing Module

- [x] 2.1 Create `packages/agent-sdk/src/testing/index.ts` with path constants (`PROJECT_ROOT`, `MASON_BIN`, `FIXTURES_DIR`)
- [x] 2.2 Implement `copyDirRecursive()` internal helper
- [x] 2.3 Implement `copyFixtureWorkspace()` with `fixture`, `excludePaths`, and `extraDirs` options
- [x] 2.4 Implement `masonExec()`, `masonExecJson()`, `masonExecExpectError()`
- [x] 2.5 Implement `isDockerAvailable()`
- [x] 2.6 Implement `waitForHealth()`
- [x] 2.7 Implement `cleanupDockerSessions()`

## 3. Package Configuration

- [x] 3.1 Update `packages/agent-sdk/package.json` — add `"./testing"` subpath export
- [x] 3.2 Update `packages/agent-sdk/package.json` — add `"fixtures"` to `files` array

## 4. Unit Tests

- [x] 4.1 Create `packages/agent-sdk/tests/testing/testing.test.ts`
- [x] 4.2 Test path constants resolve correctly
- [x] 4.3 Test `copyFixtureWorkspace` creates workspace from fixture
- [x] 4.4 Test `copyFixtureWorkspace` respects `excludePaths`
- [x] 4.5 Test `copyFixtureWorkspace` respects `extraDirs`
- [x] 4.6 Test `copyFixtureWorkspace` throws on missing fixture
- [x] 4.7 Test `isDockerAvailable` returns boolean
- [x] 4.8 Test `masonExec` invokes mason binary
- [x] 4.9 Test `masonExecExpectError` captures errors

## 5. Verification

- [x] 5.1 `npx tsc --noEmit` compiles cleanly
- [x] 5.2 `npx eslint packages/agent-sdk/src/ packages/agent-sdk/tests/` passes
- [x] 5.3 `npx vitest run packages/agent-sdk/tests/` passes (all existing + new tests)
- [x] 5.4 Existing tests in other packages still pass (no regressions)
