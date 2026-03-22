# E2E Test Relocation — Implementation Plan

**PRD:** [e2e-move/PRD.md](./PRD.md)
**Date:** March 2026

---

## Implementation Steps

---

### CHANGE 1: Shared Testing Library + Fixtures

Create the `@clawmasons/agent-sdk/testing` subpath export containing all reusable e2e test utilities, and relocate shared fixtures into `packages/agent-sdk/fixtures/`.

This is the foundation that all subsequent changes depend on. The testing library is migrated from `packages/tests/tests/helpers.ts` and provides: `PROJECT_ROOT`, `MASON_BIN`, `FIXTURES_DIR`, `copyFixtureWorkspace()`, `masonExec()`, `masonExecJson()`, `masonExecExpectError()`, `isDockerAvailable()`, `waitForHealth()`, and `cleanupDockerSessions()`.

See PRD §4 (Shared Testing Library) and §4.3 (Fixtures).

**User Story:** As a developer writing e2e tests in any agent package, I import `{ copyFixtureWorkspace, masonExec }` from `@clawmasons/agent-sdk/testing` and get workspace setup + CLI execution helpers without duplicating boilerplate or depending on `packages/tests`.

**Key files to create/modify:**
- `packages/agent-sdk/src/testing/index.ts` — new file, migrate utilities from `packages/tests/tests/helpers.ts`. All path constants (`PROJECT_ROOT`, `MASON_BIN`, `FIXTURES_DIR`) must resolve relative to the monorepo root, not relative to the old `packages/tests/` location. `FIXTURES_DIR` points to `packages/agent-sdk/fixtures/`.
- `packages/agent-sdk/package.json` — add `"./testing"` subpath export: `{ "import": "./dist/testing/index.js", "types": "./dist/testing/index.d.ts" }`
- `packages/agent-sdk/fixtures/claude-test-project/` — move from `packages/tests/fixtures/claude-test-project/`

**Dependency constraint (PRD §3, §8.1):** The testing module must NOT import from `@clawmasons/cli`, `@clawmasons/mcp-agent`, or any agent package. Only Node.js built-ins and `@clawmasons/shared` are allowed.

**Testable output:** `npx tsc --noEmit` compiles cleanly. A minimal test file importing `{ FIXTURES_DIR, copyFixtureWorkspace }` from `@clawmasons/agent-sdk/testing` resolves correctly. IDE autocomplete works on the subpath.

**Implemented**

- [Proposal](../../changes/archive/2026-03-22-shared-testing-library/proposal.md)
- [Design](../../changes/archive/2026-03-22-shared-testing-library/design.md)
- [Tasks](../../changes/archive/2026-03-22-shared-testing-library/tasks.md)
- Spec: [agent-sdk](../../specs/agent-sdk/spec.md) (updated with testing subpath and fixtures requirements)

---

### CHANGE 2: Relocate Project Role E2E Tests

Move the project-role e2e tests from `packages/tests/` into `packages/cli/tests/e2e/`, with a per-package vitest e2e config.

See PRD §5.1 (Project Role Tests) and §6.1 (Per-Package E2E).

**User Story:** As a developer iterating on CLI changes, I run `npx vitest run --config packages/cli/vitest.e2e.config.ts` to execute only the CLI's e2e tests in under 2 minutes — without running the MCP agent tests or anything else.

**Key files to create/modify:**
- `packages/cli/vitest.e2e.config.ts` — new file, mirrors settings from old `packages/tests/vitest.config.ts`: `testTimeout: 60_000`, `fileParallelism: false`, `pool: "forks"`, includes `tests/e2e/**/*.test.ts`
- `packages/cli/tests/e2e/project-role.test.ts` — move from `packages/tests/tests/project-role.test.ts`, update imports from `./helpers.js` → `@clawmasons/agent-sdk/testing`
- `packages/cli/tests/e2e/fixtures/project-role/` — move from `packages/tests/fixtures/project-role/`
- `packages/cli/package.json` — add `@clawmasons/agent-sdk` as devDependency if not already present

**Import changes:** Replace `import { ... } from "./helpers.js"` with `import { ... } from "@clawmasons/agent-sdk/testing"`. Package-specific helpers like `createProjectRoleWorkspace` stay local in the test file.

**Testable output:** `npx vitest run --config packages/cli/vitest.e2e.config.ts` runs project-role e2e tests and they pass with the same assertions as before.

**Not Implemented Yet**

---

### CHANGE 3: Relocate MCP Proxy Agent E2E Tests

Move the MCP proxy agent e2e tests from `packages/tests/` into `packages/mcp-agent/tests/e2e/`, with a per-package vitest e2e config.

See PRD §5.2 (MCP Proxy Agent Tests) and §6.1 (Per-Package E2E).

**User Story:** As a developer working on the MCP agent, I run `npx vitest run --config packages/mcp-agent/vitest.e2e.config.ts` to exercise the agent ↔ proxy communication flow without touching CLI tests.

**Key files to create/modify:**
- `packages/mcp-agent/vitest.e2e.config.ts` — new file, same e2e settings: `testTimeout: 60_000`, `fileParallelism: false`, `pool: "forks"`
- `packages/mcp-agent/tests/e2e/agent.test.ts` — move from `packages/tests/tests/mcp-proxy-agent.test.ts`, update imports from `./helpers.js` → `@clawmasons/agent-sdk/testing`. Local helpers (`waitForOutput`, `sendAndWaitFor`) remain local.
- `packages/mcp-agent/package.json` — add `@clawmasons/agent-sdk` as devDependency if not already present

**Testable output:** `npx vitest run --config packages/mcp-agent/vitest.e2e.config.ts` runs MCP agent e2e tests and they pass with the same assertions as before.

**Not Implemented Yet**

---

### CHANGE 4: Aggregate E2E Runner + Remove packages/tests

Add a root-level `test:e2e` script that discovers and runs all e2e tests across packages, then remove the old centralized `packages/tests/` package entirely.

See PRD §5.3 (Package Removal), §6.2 (Aggregate E2E), and §6.3 (Global Setup).

**User Story:** As a CI pipeline, I run `npm run test:e2e` and all e2e tests across all packages are discovered and executed sequentially with a single command and a single exit code.

**Key files to create/modify:**
- Root `package.json` — add `"test:e2e"` script that runs vitest with a glob pattern finding all `packages/*/tests/e2e/**/*.test.ts`, using e2e-appropriate settings (sequential, forks pool, 60s timeout)
- Root `vitest.e2e.config.ts` — new file (or inline in script), aggregate e2e config with the shared settings
- `packages/tests/` — **delete entirely** (package.json, vitest.config.ts, global-setup.ts, tests/, fixtures/, tmp/, AGENTS.md)
- Root `package.json` — verify `packages/tests` is not explicitly listed in workspaces (current glob `packages/*` would auto-exclude after deletion)
- `.github/` or CI config — update any references from `packages/tests` e2e commands to `npm run test:e2e`
- Update `CLAUDE.md` — replace e2e test instructions (`cd packages/tests && npx vitest run --config vitest.config.ts`) with new `npm run test:e2e` command
- `packages/tests/AGENTS.md` rules — migrate relevant e2e test conventions to `.claude/rules/e2e-tests.md` or a new location

**Global setup migration:** The old `global-setup.ts` (clears `packages/tests/tmp/mason`) is no longer needed — each package's `copyFixtureWorkspace` creates timestamped tmp dirs under a package-local or shared tmp path. If cleanup is needed, add it to the testing library's `copyFixtureWorkspace` or to per-package global setup.

**Testable output:** `npm run test:e2e` discovers and runs all e2e tests across packages (currently project-role + mcp-proxy-agent). All pass. `packages/tests/` no longer exists. `npx tsc --noEmit` compiles cleanly. CI pipeline passes.

**Not Implemented Yet**
