## Context

The forge proxy has been implemented across 9 changes (db, upstream, router, server, audit, approval, resources/prompts, CLI, Docker pipeline). The unit tests mock dependencies heavily. The old `tests/integration/mcp-proxy.sh` exercises the external tbxark/mcp-proxy binary via Docker. We need a comprehensive integration test that exercises the **native forge proxy** with a real upstream MCP server.

The existing unit tests in `tests/proxy/server.test.ts` demonstrate the pattern: create `ForgeProxyServer`, connect via MCP SDK client, make requests. The key difference for the integration test is using **real** `UpstreamManager` and `ToolRouter` with a real filesystem MCP server, plus verifying audit logs and approval workflows in an actual SQLite database.

## Goals / Non-Goals

**Goals:**
- Replace `tests/integration/mcp-proxy.sh` with a Vitest-based integration test
- Exercise the full proxy pipeline: UpstreamManager → ToolRouter → ForgeProxyServer → MCP client
- Use the real `@modelcontextprotocol/server-filesystem` as an upstream (stdio transport)
- Verify audit logging in a real (temp file) SQLite database
- Verify approval workflow with auto-timeout
- Verify clean startup and shutdown
- Test both tool listing (prefixed/filtered) and tool execution

**Non-Goals:**
- Docker testing (that's the deployment pipeline, not the proxy itself)
- Resource/prompt passthrough (already covered by unit tests; filesystem server has no resources/prompts)
- Authentication/token verification (the native proxy doesn't handle auth — that's the Docker proxy layer)
- Multiple upstream apps (would require additional MCP servers; one real server is sufficient for integration)

## Decisions

### D1: Vitest instead of shell script

**Choice:** Write the test as `tests/integration/forge-proxy.test.ts` using Vitest.

**Rationale:** Vitest provides: structured assertions, proper cleanup via `afterAll`, timeout handling, TypeScript type safety, and integration with the existing test runner (`npx vitest run`). The shell script approach required Docker, jq, curl, and manual HTTP protocol handling. The Vitest approach uses the MCP SDK client directly — the same way a real runtime connects.

### D2: Real upstream with filesystem MCP server

**Choice:** Spawn `npx @modelcontextprotocol/server-filesystem <tmpdir>` as a real stdio upstream.

**Rationale:** The filesystem server is already a test dependency (used in the example workspace). It's lightweight, has no external requirements, and exercises the real stdio transport path. Using a temp directory ensures test isolation.

### D3: Programmatic proxy setup (not `forge proxy` CLI)

**Choice:** Wire the proxy components programmatically in the test rather than invoking `forge proxy` via CLI.

**Rationale:** The CLI command adds package discovery, agent resolution, and credential loading — none of which test the proxy itself. Those are tested in `tests/cli/proxy.test.ts`. The integration test should isolate the proxy pipeline: upstream → router → server → client. This makes the test faster, more deterministic, and easier to debug.

### D4: Temp file SQLite database (not in-memory)

**Choice:** Use a temp file for the SQLite database, cleaned up after tests.

**Rationale:** In-memory databases can't be shared or inspected between connections. A temp file exercises the real file I/O path while remaining isolated. The temp file is cleaned up in `afterAll`.

### D5: Extended timeout for upstream initialization

**Choice:** Use a 30-second timeout for upstream initialization, and a 60-second timeout for the overall test suite.

**Rationale:** The first run may trigger `npx` downloading the filesystem server package. Subsequent runs will be fast. The test should tolerate this cold-start overhead.

## Risks / Trade-offs

- **npx download on first run** → The filesystem MCP server may need to be downloaded. Mitigation: extended timeout, and it's typically already cached from example workspace usage.
- **Port conflicts** → Using a fixed port could conflict with other running tests. Mitigation: use high port (19200+) outside the range used by unit tests (19100+), and the test is typically run alone.
- **Filesystem server tool names** → The real server may expose different tools than expected. Mitigation: the test dynamically discovers available tools and asserts on known ones (read_file, write_file, list_directory).
