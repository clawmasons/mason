## Context

The mason monorepo has e2e test utilities and shared fixtures in `packages/tests/`. These utilities (`copyFixtureWorkspace`, `masonExec`, `isDockerAvailable`, etc.) are used by all e2e tests but are locked inside a test-only package. The PRD calls for migrating them to `@clawmasons/agent-sdk/testing` as the first step toward colocating e2e tests with their packages.

The `packages/agent-sdk` package already exports types and helpers via a single entry point. Adding a `./testing` subpath export keeps test utilities isolated from production code — consumers of `@clawmasons/agent-sdk` never pull in test dependencies unless they explicitly import from the `/testing` subpath.

## Goals / Non-Goals

**Goals:**
- Create `packages/agent-sdk/src/testing/index.ts` with all e2e test utilities migrated from `packages/tests/tests/helpers.ts`
- Add `cleanupDockerSessions()` helper (extracted from inline cleanup in mcp-proxy-agent test)
- Add `extraDirs` support to `copyFixtureWorkspace()` for directories outside the default `WORKSPACE_DIRS` set (e.g., `.codex/`)
- Add `./testing` subpath export to `packages/agent-sdk/package.json`
- Copy `claude-test-project` fixture to `packages/agent-sdk/fixtures/`
- Write unit tests for path resolution, fixture copying, and error handling
- Ensure `npx tsc --noEmit` compiles cleanly

**Non-Goals:**
- Moving any test files from `packages/tests/` (Change 2, 3)
- Removing `packages/tests/` (Change 4)
- Adding aggregate e2e runner (Change 4)
- Modifying existing e2e tests in `packages/tests/`

## Decisions

### 1. Path resolution via `import.meta.url`, not `__dirname`

The existing helpers use `fileURLToPath(import.meta.url)` to resolve `__dirname`, then compute paths relative to the file location. The new testing module does the same but resolves upward from `packages/agent-sdk/src/testing/` (or `packages/agent-sdk/dist/testing/` at runtime) to find the monorepo root. `PROJECT_ROOT` is computed by walking up from the source file to the monorepo root using a `package.json` with `workspaces` as an anchor.

### 2. `FIXTURES_DIR` points to source, not dist

Fixtures are static files (JSON, Markdown) that do not need compilation. `FIXTURES_DIR` resolves to `packages/agent-sdk/fixtures/` relative to `PROJECT_ROOT`, not inside `dist/`. This avoids needing to copy fixtures during build. The `files` field in `package.json` is updated to include `fixtures` for npm publishing.

### 3. `cleanupDockerSessions()` extracted as reusable utility

The mcp-proxy-agent test has inline Docker Compose cleanup logic. This is extracted into a `cleanupDockerSessions(workspaceDir)` function that iterates `.mason/sessions/*/docker/docker-compose.yml` and runs `docker compose down`. This is reusable by any agent e2e test.

### 4. `copyFixtureWorkspace` enhanced with `extraDirs` option

The current `WORKSPACE_DIRS` list covers common directories (`apps`, `tasks`, `skills`, `roles`, `agents`, `.mason`, `.claude`). Some fixtures (like `project-role`) include `.codex/` which is not in this list. The `extraDirs` option allows callers to specify additional directories to copy, keeping the default list stable.

### 5. Temp directory location: `os.tmpdir()`

The old helpers write temp workspaces to `packages/tests/tmp/`. The new testing library uses `os.tmpdir()` + a mason-specific subdirectory (`mason-e2e-{name}-{timestamp}`). This avoids creating temp directories inside the package tree.

### 6. No new npm dependencies

The testing module uses only Node.js built-ins: `fs`, `path`, `child_process`, `url`, `os`. No test framework dependencies are re-exported. No `@clawmasons/shared` import needed (none of the utilities require it).

## Module Structure

```
packages/agent-sdk/
  src/
    testing/
      index.ts        # All e2e test utilities (migrated + new)
    index.ts           # Existing — unchanged
  fixtures/
    claude-test-project/
      package.json
      .claude/
        commands/take-notes.md
        skills/markdown-conventions/SKILL.md
      .mason/
        roles/writer/ROLE.md
  tests/
    testing/
      testing.test.ts  # Unit tests for the testing library
  package.json         # Updated exports, files
  tsconfig.json        # Unchanged (already includes src/**)
  tsconfig.build.json  # Unchanged (extends tsconfig.json)
```

## Exported API

All exports from `@clawmasons/agent-sdk/testing`:

| Export | Type | Description |
|--------|------|-------------|
| `PROJECT_ROOT` | `string` | Absolute path to monorepo root |
| `MASON_BIN` | `string` | Absolute path to `scripts/mason.js` |
| `FIXTURES_DIR` | `string` | Absolute path to `packages/agent-sdk/fixtures/` |
| `copyFixtureWorkspace(name, opts?)` | `function` | Copies fixture to temp dir, returns path |
| `masonExec(args, cwd, opts?)` | `function` | Runs mason CLI, returns stdout |
| `masonExecJson<T>(args, cwd, opts?)` | `function` | Runs mason CLI with --json, parses output |
| `masonExecExpectError(args, cwd, opts?)` | `function` | Runs command expected to fail |
| `isDockerAvailable()` | `function` | Checks Docker daemon reachability |
| `waitForHealth(url, timeoutMs, diagnostics?)` | `async function` | Polls health endpoint |
| `cleanupDockerSessions(workspaceDir)` | `function` | Tears down Docker sessions |

### `copyFixtureWorkspace` signature

```typescript
function copyFixtureWorkspace(
  name: string,
  opts?: {
    fixture?: string;       // Fixture name under FIXTURES_DIR (default: "claude-test-project")
    excludePaths?: string[]; // Relative paths to remove after copying
    extraDirs?: string[];    // Additional directories to copy beyond WORKSPACE_DIRS
  }
): string;
```

## Test Coverage

### Unit Tests (`packages/agent-sdk/tests/testing/testing.test.ts`)

1. **Path constants resolve correctly**
   - `PROJECT_ROOT` ends with the monorepo directory name
   - `MASON_BIN` points to an existing file
   - `FIXTURES_DIR` points to an existing directory containing `claude-test-project/`

2. **`copyFixtureWorkspace` creates workspace from fixture**
   - Copies `claude-test-project` fixture to temp dir
   - Workspace contains `package.json`, `.claude/`, `.mason/` directories
   - Workspace path contains the provided name
   - Temp dir is under `os.tmpdir()`

3. **`copyFixtureWorkspace` respects `excludePaths`**
   - Excluded paths are not present in the copied workspace

4. **`copyFixtureWorkspace` respects `extraDirs`**
   - Extra directories are copied when specified

5. **`copyFixtureWorkspace` throws on missing fixture**
   - Throws error containing "not found" when fixture name doesn't exist

6. **`isDockerAvailable` returns boolean**
   - Returns `true` or `false` without throwing

7. **`masonExec` invokes mason binary**
   - Running `mason --version` returns a version string without error

8. **`masonExecExpectError` captures errors**
   - Running an invalid command returns non-zero exit code

9. **`cleanupDockerSessions` handles missing sessions dir**
   - Does not throw when `.mason/sessions/` does not exist
