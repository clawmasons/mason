# E2E Test Specification

## Principles

### REQ-01: CLI-only testing

E2E tests SHALL invoke the `chapter` CLI binary exclusively. Tests MUST NOT import internal APIs from `packages/cli/src/`, `packages/proxy/src/`, or `packages/shared/src/`. The only imports allowed from the monorepo are type-only imports if strictly necessary.

**Rationale:** E2E tests verify the CLI's public contract — exit codes, stdout, generated files, and running containers. Internal function behavior is covered by unit tests in `packages/*/tests/`.

#### Scenario: No internal imports
- **GIVEN** any file in `e2e/tests/`
- **WHEN** scanned for import paths matching `../../packages/`
- **THEN** zero matches are found

#### Scenario: No resolve aliases needed
- **GIVEN** `e2e/vitest.config.ts`
- **THEN** it contains no `resolve.alias` entries for `@clawmasons/*` packages

### REQ-02: CLI as the setup mechanism

Test setup SHALL use `chapter build` (or other CLI commands) to produce all artifacts. Tests MUST NOT manually replicate CLI functionality such as:
- Calling `generateDockerfiles()` directly
- Calling `validateDockerfiles()` directly
- Setting up `docker/node_modules` with symlinks
- Calling resolver or validator functions programmatically

The only pre-CLI setup allowed is copying fixture files to a temp workspace (test infrastructure, not CLI duplication).

#### Scenario: Build produces all Docker artifacts
- **GIVEN** a fixture workspace copied to a temp directory
- **WHEN** `chapter build` is run
- **THEN** `chapter.lock.json`, `dist/*.tgz`, and `docker/` (with Dockerfiles, node_modules, and workspace) are all produced without additional programmatic steps

### REQ-03: Shared test helpers

Common test operations SHALL be extracted to `e2e/tests/helpers.ts` to eliminate duplication across test files. Required helpers:

| Helper | Purpose |
|--------|---------|
| `copyFixtureWorkspace(name, opts?)` | Copy fixtures to temp dir, optionally excluding paths |
| `chapterExec(args, cwd, opts?)` | Run `chapter` CLI, return stdout |
| `chapterExecJson<T>(args, cwd)` | Run `chapter` with `--json`, parse output |
| `waitForHealth(url, timeout, diagnostics?)` | Poll health endpoint with Docker log diagnostics on failure |
| `isDockerAvailable()` | Check Docker daemon availability |

### REQ-04: Unit tests belong in packages

Tests for internal module functions SHALL live in `packages/*/tests/`, not in `e2e/tests/`. Specifically:

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

`e2e/tests/build-pi-runtime.test.ts` validates the pi-coding-agent runtime build for the note-taker agent.

**Setup:** `copyFixtureWorkspace()` + `chapter build @test/agent-test-note-taker`

**Coverage:**
- Lock file structure (lockVersion, agent name, runtimes, roles)
- Proxy Dockerfile existence and content (FROM node, USER mason, npm rebuild better-sqlite3)
- Agent Dockerfile existence and content (npm install -g pi-coding-agent)
- Workspace materialization (AGENTS.md, .pi/settings.json, .pi/mcp.json, .pi/extensions, skills/)
- `chapter validate` exits 0
- `chapter list --json` includes the agent

### REQ-06: build-pipeline

`e2e/tests/build-pipeline.test.ts` validates the full `chapter build` pipeline and Docker proxy connectivity.

**Setup:** `copyFixtureWorkspace()` + `chapter build`

**Coverage:**
- Build output: chapter.lock.json, dist/*.tgz
- docker/node_modules: @clawmasons/mason, @clawmasons/proxy, @clawmasons/shared, chapter packages from dist, .bin/chapter symlink, transitive dependencies
- Proxy Dockerfile: existence and structure
- Agent Dockerfile: existence and structure
- Workspace materialization: workspace directory exists
- Run-agent prerequisites: proxy and agent Dockerfiles exist
- Proxy boot + MCP connectivity (requires Docker): image build, container start, health endpoint, MCP client connect + tool listing, auth rejection (no token, wrong token)

### REQ-07: docker-proxy

`e2e/tests/docker-proxy.test.ts` validates Docker proxy behavior with ACP session metadata.

**Setup:** `copyFixtureWorkspace(excludePaths: ["agents/mcp-test", "roles/mcp-test"])` + `chapter build`

**Coverage:**
- Proxy Docker image builds with ACP config
- Proxy container starts with ACP session env vars (CHAPTER_SESSION_TYPE=acp, CHAPTER_ACP_CLIENT)
- Proxy health endpoint responds
- MCP client connects and lists governed tools (filesystem tools visible)
- Auth rejection (no token, wrong token)
- Tool call through governed proxy succeeds

## Verification

To verify all requirements:

```bash
# No internal imports
grep -r "../../packages/" e2e/tests/ && echo "FAIL: internal imports found" || echo "PASS"

# Unit tests pass
npx vitest run  # 1034+ tests

# E2E tests pass
cd e2e && npx vitest run  # 44+ tests (2 skipped)

# Type check
npx tsc --noEmit
```
