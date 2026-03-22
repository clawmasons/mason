# E2E Test Relocation — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

All end-to-end tests currently live in a single centralized package (`packages/tests/`), separate from the packages they validate. This creates several problems:

- **Distance between code and tests:** A developer working on `packages/mcp-agent` must navigate to a different package to find, read, or modify its e2e tests. This breaks the convention that tests live alongside the code they verify.
- **Monolithic test helpers:** The shared test utilities in `packages/tests/tests/helpers.ts` (workspace setup, CLI execution, Docker checks) are only available within the `packages/tests` package. New agent packages cannot reuse them without importing from a test-only package.
- **Fixture duplication risk:** Fixtures like `claude-test-project` are locked inside `packages/tests/fixtures/`. Any new agent that needs similar test infrastructure must duplicate the fixture or create ad-hoc setup code.
- **No per-package e2e execution:** There is no way to run e2e tests for a single package in isolation. The entire e2e suite runs as one block, slowing down development feedback loops.
- **Circular dependency risk:** Test helpers that import from specific agent packages (e.g., `packages/cli`) would create circular dependencies if shared broadly. The current helpers avoid this by invoking the CLI as a subprocess, but there is no architectural guardrail enforcing this pattern.

---

## 2. Goals

### User Goals
- **Colocated e2e tests:** Each agent package has its own `tests/e2e/` directory containing e2e tests specific to that agent's functionality.
- **Shared test utilities:** A reusable testing library (`@clawmasons/agent-sdk/testing`) provides workspace setup, CLI execution helpers, Docker utilities, and fixture management — importable by any agent package.
- **Shared fixtures:** Common test fixtures (e.g., `claude-test-project`) live in `agent-sdk/fixtures/` and are accessible to all agent packages via the testing utilities.
- **Per-package and aggregate execution:** Developers can run e2e tests for a single package or all packages via a single command.
- **Fully remove `packages/tests/`:** After migration, the centralized test package is deleted.

### Non-Goals
- **Changing test logic:** The tests themselves are relocated, not rewritten. Assertions and test scenarios remain the same.
- **Adding new e2e tests:** This PRD covers the migration of existing tests only. New tests may be added in follow-up work.
- **Modifying unit tests:** Unit tests in `packages/*/tests/` are unchanged. Only e2e tests are affected.

---

## 3. Design Principles

- **No circular dependencies.** The `@clawmasons/agent-sdk/testing` module must not import from any downstream package (`packages/cli`, `packages/mcp-agent`, etc.). It may only depend on `@clawmasons/shared` (already a dependency) and Node.js built-ins. CLI interaction is done by invoking the `mason` binary as a subprocess.
- **Convention over configuration.** E2e tests live in `tests/e2e/` within each package. Fixtures specific to a package live in `tests/e2e/fixtures/`. Shared fixtures live in `agent-sdk/fixtures/`.
- **Tests stay succinct.** The shared testing library handles boilerplate (workspace setup, CLI execution, cleanup). Individual test files focus on assertions and scenarios.
- **Subpath export isolation.** The testing utilities are exported via `@clawmasons/agent-sdk/testing`, not the main entry point. Production code that imports `@clawmasons/agent-sdk` does not pull in test dependencies.

---

## 4. Shared Testing Library

### 4.1 Location and Export

The testing utilities are placed in `packages/agent-sdk/src/testing/` and exported as a subpath:

```
@clawmasons/agent-sdk/testing → packages/agent-sdk/src/testing/index.ts
```

The `package.json` `exports` field is updated to include:

```json
{
  ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
  "./testing": { "import": "./dist/testing/index.js", "types": "./dist/testing/index.d.ts" }
}
```

### 4.2 Provided Utilities

The testing library provides the following utilities, migrated from `packages/tests/tests/helpers.ts`:

| Utility | Description |
|---------|-------------|
| `PROJECT_ROOT` | Resolved path to the monorepo root |
| `MASON_BIN` | Path to `scripts/mason.js` |
| `FIXTURES_DIR` | Path to `agent-sdk/fixtures/` |
| `copyFixtureWorkspace(name, opts?)` | Copies a fixture to a timestamped tmp directory. Accepts `fixture` name, `excludePaths`, and optional `extraDirs` to copy beyond the default set |
| `masonExec(args, cwd, opts?)` | Runs the `mason` CLI binary and returns stdout |
| `masonExecJson<T>(args, cwd, opts?)` | Runs with `--json` flag and parses output |
| `masonExecExpectError(args, cwd, opts?)` | Runs a CLI command expected to fail, returns `{ stdout, stderr, exitCode }` |
| `isDockerAvailable()` | Checks if Docker daemon is reachable |
| `waitForHealth(url, timeoutMs, diagnostics?)` | Polls a health endpoint with Docker Compose log fallback |
| `cleanupDockerSessions(workspaceDir)` | Tears down Docker Compose sessions in a workspace's `.mason/sessions/` |

**Dependency constraint:** All utilities interact with the CLI and Docker via `child_process` (subprocess invocation). They must not import any code from `packages/cli`, `packages/mcp-agent`, or other agent packages.

### 4.3 Fixtures

Shared fixtures are stored in `packages/agent-sdk/fixtures/`:

```
packages/agent-sdk/fixtures/
  claude-test-project/
    package.json
    .claude/
      commands/take-notes.md
      skills/markdown-conventions/SKILL.md
```

The `FIXTURES_DIR` constant points to this directory. Package-specific fixtures (e.g., `project-role/`) live in the package's own `tests/e2e/fixtures/` directory.

---

## 5. Test Relocation

### 5.1 Project Role Tests → `packages/cli/tests/e2e/`

| Source | Destination |
|--------|-------------|
| `packages/tests/tests/project-role.test.ts` | `packages/cli/tests/e2e/project-role.test.ts` |
| `packages/tests/fixtures/project-role/` | `packages/cli/tests/e2e/fixtures/project-role/` |

The test file's imports change from `./helpers.js` to `@clawmasons/agent-sdk/testing`. Package-specific helpers (e.g., `createProjectRoleWorkspace`) remain in the test file or a local helper.

### 5.2 MCP Proxy Agent Tests → `packages/mcp-agent/tests/e2e/`

| Source | Destination |
|--------|-------------|
| `packages/tests/tests/mcp-proxy-agent.test.ts` | `packages/mcp-agent/tests/e2e/agent.test.ts` |

The test uses the `claude-test-project` fixture from `agent-sdk/fixtures/` via the `FIXTURES_DIR` constant. The `waitForOutput` and `sendAndWaitFor` helpers defined locally in the test file remain local (they are test-specific, not reusable infrastructure).

### 5.3 Package Removal

After all tests and fixtures are relocated:

1. Delete `packages/tests/` entirely (package.json, vitest.config.ts, global-setup.ts, fixtures/, tests/, tmp/).
2. Remove `packages/tests` from the root `package.json` workspaces array (if listed).
3. Remove any CI references to `packages/tests`.

---

## 6. Test Execution

### 6.1 Per-Package E2E

Each package with e2e tests includes a vitest config or uses the package-level test command with a path filter:

```bash
# Run cli e2e tests
npx vitest run packages/cli/tests/e2e/ --config packages/cli/vitest.e2e.config.ts

# Run mcp-agent e2e tests
npx vitest run packages/mcp-agent/tests/e2e/ --config packages/mcp-agent/vitest.e2e.config.ts
```

Each package with e2e tests gets a `vitest.e2e.config.ts` that mirrors the settings from the old `packages/tests/vitest.config.ts`:
- `testTimeout: 60_000`
- `fileParallelism: false`
- `pool: "forks"`

### 6.2 Aggregate E2E

A root-level script discovers and runs all e2e tests across packages:

```bash
# Run all e2e tests across all packages
npm run test:e2e
```

This script (in root `package.json`) invokes vitest with a glob pattern that finds all `tests/e2e/**/*.test.ts` files, using a shared e2e vitest config at the root level.

### 6.3 Global Setup

The existing `global-setup.ts` (which clears tmp directories before runs) is moved into the testing library or replicated per-package as needed. Each package's e2e vitest config can reference a local or shared global setup.

---

## 7. Use Cases

### UC-1: Developer Adds E2E Tests for an Agent

**Actor:** Developer building a new agent package (e.g., `packages/my-agent`).
**Goal:** Write e2e tests that validate the agent works end-to-end through the CLI.

**Flow:**
1. Developer creates `packages/my-agent/tests/e2e/agent.test.ts`.
2. Developer imports `{ copyFixtureWorkspace, masonExec, isDockerAvailable }` from `@clawmasons/agent-sdk/testing`.
3. Developer uses `copyFixtureWorkspace("my-test", { fixture: "claude-test-project" })` to set up a workspace.
4. Developer writes assertions against CLI output.
5. Developer runs `npx vitest run packages/my-agent/tests/e2e/`.

**Acceptance Criteria:**
- The test file is under 50 lines for a basic scenario (setup + assertions only).
- No boilerplate for workspace copying, CLI execution, or Docker checks.
- The test runs independently without affecting other packages.

---

### UC-2: Developer Imports Shared Testing Utilities

**Actor:** Developer writing e2e tests in any agent package.
**Goal:** Use workspace setup, CLI execution, and Docker utilities without duplicating code.

**Flow:**
1. Developer adds `@clawmasons/agent-sdk` as a devDependency (if not already present).
2. Developer imports from `@clawmasons/agent-sdk/testing`.
3. All helpers are available with correct path resolution.

**Acceptance Criteria:**
- `@clawmasons/agent-sdk/testing` resolves correctly in TypeScript and at runtime.
- No circular dependency warnings during build.
- IDE autocomplete works for the testing subpath.

---

### UC-3: Developer Runs E2E Tests for a Single Package

**Actor:** Developer iterating on `packages/cli` changes.
**Goal:** Run only the cli e2e tests without running the full suite.

**Flow:**
1. Developer runs `npx vitest run packages/cli/tests/e2e/`.
2. Only project-role and other cli-specific e2e tests execute.
3. Results appear in under 2 minutes (excluding Docker build time).

**Acceptance Criteria:**
- Per-package execution works with correct vitest config.
- Tests do not depend on state from other packages' tests.

---

### UC-4: CI Runs All E2E Tests

**Actor:** CI pipeline.
**Goal:** Execute all e2e tests across all packages in a single step.

**Flow:**
1. CI runs `npm run test:e2e`.
2. All `tests/e2e/**/*.test.ts` files across all packages are discovered and executed.
3. Tests run sequentially (no file parallelism) to avoid Docker resource conflicts.

**Acceptance Criteria:**
- A single command runs all e2e tests.
- Sequential execution prevents port/resource conflicts.
- Exit code reflects pass/fail across all packages.

---

### UC-5: New Agent Package Bootstraps E2E Tests

**Actor:** Developer creating a new agent package.
**Goal:** Quickly set up e2e testing with shared infrastructure.

**Flow:**
1. Developer creates `tests/e2e/` directory in the new package.
2. Developer creates a `vitest.e2e.config.ts` with standard e2e settings.
3. Developer writes a test file importing from `@clawmasons/agent-sdk/testing`.
4. Developer uses `copyFixtureWorkspace` with the `claude-test-project` fixture.

**Acceptance Criteria:**
- Bootstrapping a new e2e test takes under 5 minutes.
- No need to understand or modify the old centralized test package.

---

## 8. Non-Functional Requirements

### 8.1 No Circular Dependencies

The `@clawmasons/agent-sdk/testing` module depends only on:
- Node.js built-ins (`fs`, `path`, `child_process`, `url`)
- `@clawmasons/shared` (existing dependency, if needed)

It must **never** import from `@clawmasons/cli`, `@clawmasons/mcp-agent`, or any other agent implementation package.

### 8.2 Backward Compatibility

- Existing unit tests in `packages/*/tests/` are unchanged.
- The e2e test behavior (assertions, scenarios, timeouts) is preserved exactly.
- CI pipelines are updated to use the new test execution commands.

### 8.3 Error Handling

- If `FIXTURES_DIR` cannot be resolved (e.g., `agent-sdk` not built), the testing library throws a clear error: `"Cannot resolve agent-sdk fixtures directory. Ensure @clawmasons/agent-sdk is built."`.
- If a requested fixture does not exist, `copyFixtureWorkspace` throws: `"Fixture '<name>' not found in <FIXTURES_DIR>."`.
