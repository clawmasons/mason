# E2E Test Specification

## Principles

### REQ-01: CLI-only testing

E2E tests SHALL invoke the `mason` CLI binary exclusively. Tests MUST NOT import internal APIs from `packages/cli/src/`, `packages/proxy/src/`, or `packages/shared/src/`. The only imports allowed from the monorepo are type-only imports if strictly necessary.

**Rationale:** E2E tests verify the CLI's public contract — exit codes, stdout, generated files, and running containers. Internal function behavior is covered by unit tests in `packages/*/tests/`.

#### Scenario: No internal imports
- **GIVEN** any file in `packages/tests/tests/`
- **WHEN** scanned for import paths matching `../../packages/`
- **THEN** zero matches are found

#### Scenario: No resolve aliases needed
- **GIVEN** `packages/tests/vitest.config.ts`
- **THEN** it contains no `resolve.alias` entries for `@clawmasons/*` packages

### REQ-02: CLI as the setup mechanism

Test setup SHALL use `mason build` (or other CLI commands) to produce all artifacts. Tests MUST NOT manually replicate CLI functionality such as:
- Calling `generateDockerfiles()` directly
- Calling `validateDockerfiles()` directly
- Setting up `docker/node_modules` with symlinks
- Calling resolver or validator functions programmatically

The only pre-CLI setup allowed is copying fixture files to a temp workspace (test infrastructure, not CLI duplication).

#### Scenario: Build produces all Docker artifacts
- **GIVEN** a fixture workspace copied to a temp directory
- **WHEN** `mason build` is run
- **THEN** `chapter.lock.json`, `dist/*.tgz`, and `docker/` (with Dockerfiles, node_modules, and workspace) are all produced without additional programmatic steps

### REQ-03: Shared test helpers

Common test operations SHALL be extracted to `packages/tests/tests/helpers.ts` to eliminate duplication across test files. Required helpers:

| Helper | Purpose |
|--------|---------|
| `copyFixtureWorkspace(name, opts?)` | Copy fixtures to temp dir, optionally excluding paths |
| `masonExec(args, cwd, opts?)` | Run `mason` CLI, return stdout |
| `masonExecJson<T>(args, cwd)` | Run `mason` with `--json`, parse output |
| `waitForHealth(url, timeout, diagnostics?)` | Poll health endpoint with Docker log diagnostics on failure |
| `isDockerAvailable()` | Check Docker daemon availability |

`MASON_BIN` SHALL resolve to `scripts/mason.js` at the monorepo root.

#### Scenario: Helper functions available
- **GIVEN** any E2E test file
- **WHEN** it imports from `./helpers`
- **THEN** `masonExec`, `masonExecJson`, `copyFixtureWorkspace`, `waitForHealth`, and `isDockerAvailable` are available

### REQ-04: Unit tests belong in packages

Tests for internal module functions SHALL live in `packages/*/tests/`, not in `packages/tests/tests/`. Specifically:

| Module | Unit test location |
|--------|--------------------|
| `matchServers()` | `packages/cli/tests/acp/matcher.test.ts` |
| `rewriteMcpConfig()`, `extractCredentials()` | `packages/cli/tests/acp/rewriter.test.ts` |
| `generateWarnings()` | `packages/cli/tests/acp/warnings.test.ts` |
| `logDroppedServers()` | `packages/proxy/tests/hooks/audit.test.ts` |
| `openDatabase()`, `queryAuditLog()` | `packages/proxy/tests/` |
| `validateDockerfiles()` | `packages/cli/tests/` |
| `generateDockerfiles()` | `packages/cli/tests/` |

E2E tests MAY verify the observable effects of these modules (e.g., checking that a Docker proxy exposes governed tools) but MUST NOT call the functions directly.

## Test Suites

### REQ-05: build-pi-runtime

`packages/tests/tests/build-pi-runtime.test.ts` validates the pi-coding-agent runtime build for the note-taker agent.

**Setup:** `copyFixtureWorkspace()` + `mason build @test/agent-test-note-taker`

**Coverage:**
- Lock file structure (lockVersion, agent name, runtimes, roles)
- Proxy Dockerfile existence and content (FROM node, USER mason, npm rebuild better-sqlite3)
- Agent Dockerfile existence and content (npm install -g pi-coding-agent)
- Workspace materialization (AGENTS.md, .pi/settings.json, .pi/mcp.json, .pi/extensions, skills/)
- `mason validate` exits 0
- `mason list --json` includes the agent

#### Scenario: Build and validate pi-runtime
- **WHEN** `mason build @test/agent-test-note-taker` is run on a fixture workspace
- **THEN** lock file, Dockerfiles, and workspace are generated correctly

### REQ-06: build-pipeline

`packages/tests/tests/build-pipeline.test.ts` validates the full `mason build` pipeline and Docker proxy connectivity.

**Setup:** `copyFixtureWorkspace()` + `mason build`

**Coverage:**
- Build output: chapter.lock.json, dist/*.tgz
- docker/node_modules: @clawmasons/mason, @clawmasons/proxy, @clawmasons/shared, packages from dist, .bin/mason symlink, transitive dependencies
- Proxy Dockerfile: existence and structure
- Agent Dockerfile: existence and structure
- Workspace materialization: workspace directory exists
- Run-agent prerequisites: proxy and agent Dockerfiles exist
- Proxy boot + MCP connectivity (requires Docker)

#### Scenario: Build pipeline produces correct artifacts
- **WHEN** `mason build` is run on a fixture workspace
- **THEN** all Docker artifacts are generated with `mason` references (not `clawmasons`)

### REQ-07: docker-proxy

`packages/tests/tests/docker-proxy.test.ts` validates Docker proxy behavior with ACP session metadata.

**Setup:** `copyFixtureWorkspace(excludePaths: ["agents/mcp-test", "roles/mcp-test"])` + `mason build`

**Coverage:**
- Proxy Docker image builds with ACP config
- Proxy container starts with ACP session env vars (CHAPTER_SESSION_TYPE=acp, CHAPTER_ACP_CLIENT)
- Proxy health endpoint responds
- MCP client connects and lists governed tools
- Auth rejection (no token, wrong token)
- Tool call through governed proxy succeeds

#### Scenario: Docker proxy with ACP session
- **WHEN** `mason build` is run and proxy container is started
- **THEN** proxy responds to health checks and MCP client connections

### REQ-08: E2E test suite includes globalTeardown for Docker resource cleanup

The vitest e2e configuration SHALL reference a `globalTeardown` module that prunes orphaned mason Docker resources after all tests complete. The teardown SHALL remove stopped mason containers and unused mason networks. The teardown SHALL run even if tests crash or timeout.

#### Scenario: Orphaned containers pruned after test suite
- **WHEN** the e2e test suite completes (success or failure)
- **THEN** any stopped Docker containers with mason name patterns are removed

#### Scenario: Orphaned networks pruned after test suite
- **WHEN** the e2e test suite completes (success or failure)
- **THEN** any unused Docker networks with mason name patterns are removed

#### Scenario: Teardown does not remove running containers
- **WHEN** the globalTeardown runs
- **THEN** only stopped (exited) mason containers are removed
- **AND** running containers are left untouched

## Verification

To verify all requirements:

```bash
# No internal imports
grep -r "../../packages/" packages/tests/tests/ && echo "FAIL: internal imports found" || echo "PASS"

# Unit tests pass
npx vitest run  # 1034+ tests

# E2E tests pass
cd packages/tests && npx vitest run  # 44+ tests (2 skipped)

# Type check
npx tsc --noEmit
```
