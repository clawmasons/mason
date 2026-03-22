## Why

E2E test utilities (`copyFixtureWorkspace`, `masonExec`, `isDockerAvailable`, etc.) and shared fixtures (`claude-test-project`) are locked inside `packages/tests/`, making them inaccessible to other packages. Any agent package that needs e2e testing must either duplicate this infrastructure or depend on a test-only package. The `@clawmasons/agent-sdk/testing` subpath export provides a clean, reusable foundation that all agent packages can import without circular dependencies.

## What Changes

- Create `packages/agent-sdk/src/testing/index.ts` migrating all utilities from `packages/tests/tests/helpers.ts`, plus a new `cleanupDockerSessions()` helper
- Add `./testing` subpath export to `packages/agent-sdk/package.json` (`"./testing"` entry in `exports`)
- Copy `packages/tests/fixtures/claude-test-project/` to `packages/agent-sdk/fixtures/claude-test-project/`
- Update `FIXTURES_DIR` to point to `packages/agent-sdk/fixtures/`
- Add `copyFixtureWorkspace` support for `extraDirs` option (beyond the default `WORKSPACE_DIRS` set)
- Ensure the testing module only depends on Node.js built-ins and `@clawmasons/shared`

## Capabilities

### New Capabilities
- `agent-sdk-testing`: Shared e2e testing library exported as `@clawmasons/agent-sdk/testing` — provides `PROJECT_ROOT`, `MASON_BIN`, `FIXTURES_DIR`, `copyFixtureWorkspace()`, `masonExec()`, `masonExecJson()`, `masonExecExpectError()`, `isDockerAvailable()`, `waitForHealth()`, and `cleanupDockerSessions()`

### Modified Capabilities
- `agent-sdk`: Updated package.json `exports` and `files` to include the testing subpath and fixtures directory

## Impact

- **New file:** `packages/agent-sdk/src/testing/index.ts`
- **New directory:** `packages/agent-sdk/fixtures/claude-test-project/`
- **Modified:** `packages/agent-sdk/package.json` (exports, files)
- **Modified:** `packages/agent-sdk/tsconfig.build.json` (include testing source)
- **Tests:** Unit tests in `packages/agent-sdk/tests/testing/` verifying path resolution, fixture copying, and CLI execution helpers
- **Dependencies:** No new npm dependencies — uses only Node.js built-ins
