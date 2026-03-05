## Context

The forge proxy has all its core modules built:
1. **Database** (`src/proxy/db.ts`): SQLite for audit logging and approval workflows
2. **Upstream** (`src/proxy/upstream.ts`): Manages MCP client connections to upstream app servers
3. **Routing** (`src/proxy/router.ts`): Tool/resource/prompt prefixing and filtering
4. **Server** (`src/proxy/server.ts`): Downstream MCP server with SSE and streamable-http transports
5. **Hooks** (`src/proxy/hooks/`): Audit logging and approval workflow hooks

What's missing is the **orchestration layer** — a CLI command that discovers the agent workspace, resolves the dependency graph, loads credentials, and wires everything together to produce a running proxy.

The existing CLI uses Commander.js with a `registerXxxCommand(program)` pattern. Each command module exports a registration function.

## Goals / Non-Goals

**Goals:**
- Create `forge proxy` CLI command following PRD §6.2 startup sequence (steps 1-10)
- Load `.env` credentials and resolve `${VAR}` references in app env fields
- Support `--port`, `--startup-timeout`, and `--agent` flags
- Graceful shutdown on SIGINT/SIGTERM
- Clear error messages for common failures (no agent found, multiple agents, upstream timeout)

**Non-Goals:**
- OAuth token refresh (P1 — REQ-012)
- Authentication on the MCP endpoint (future work)
- Docker integration updates (CHANGE 9)
- Credential encryption (future work)

## Decisions

### D1: Hand-roll `.env` parsing instead of adding `dotenv` dependency

**Choice:** Parse `.env` files manually with a simple line-by-line parser.

**Rationale:** The `.env` format is straightforward (KEY=VALUE, comments with `#`, blank lines). Adding `dotenv` as a dependency is unnecessary weight for ~20 lines of parsing code. The forge project already avoids unnecessary dependencies.

### D2: Resolve `${VAR}` references at proxy startup, not at Docker compose time

**Choice:** The credential loader resolves `${VAR}` in app env fields at proxy startup time using the loaded `.env` values merged with `process.env`.

**Rationale:** When running `forge proxy` directly (not in Docker), Docker compose isn't involved. The proxy needs to resolve env var references itself. `process.env` is checked first (allowing runtime overrides), then `.env` file values.

### D3: Agent auto-detection with `--agent` override

**Choice:** If `--agent` is not provided, discover all agent packages. If exactly one agent exists, use it. If zero or multiple, exit with a descriptive error. The `--agent` flag selects a specific agent by name.

**Rationale:** Matches the UX pattern from `forge run` and other commands. Most workspaces have one agent, so auto-detection is the common path. The error message for multiple agents lists them so the user knows what to pass.

### D4: Collect approval patterns from all roles

**Choice:** Union all `requireApprovalFor` patterns from all roles in the agent, then prefix them with the app short name following the same `<app>_<pattern>` convention.

**Rationale:** The approval patterns in role constraints use prefixed tool names (e.g., `github_delete_*`). Since patterns are already prefixed in the role definition, we simply collect and pass them to the server. No transformation needed beyond deduplication.

### D5: Startup sequence follows PRD §6.2 exactly

**Choice:** The startup sequence is:
1. Discover packages in workspace
2. Resolve agent dependency graph
3. Compute role-filtered tool allow-lists
4. Load credentials from `.env`
5. Open SQLite, create tables, enable WAL
6. Start all upstream MCP clients in parallel (with timeout)
7. Enumerate upstream tools/resources/prompts, build routing tables
8. Initialize hook pipeline context (agentName, approval patterns)
9. Start MCP server on configured port
10. Log "forge proxy ready"

### D6: Deduplicate apps across roles

**Choice:** When collecting apps from all roles, deduplicate by package name. Each unique app gets one upstream client connection.

**Rationale:** Multiple roles may reference the same app (e.g., both "developer" and "reviewer" roles use `@clawforge/app-github`). We only need one upstream connection per app.

## Risks / Trade-offs

- **No health check endpoint** → The proxy server only handles MCP protocol requests. A future change could add a `/health` endpoint for monitoring. → Acceptable for v1.

- **`.env` in workspace root only** → The credential loader only looks for `.env` in `process.cwd()`. Nested `.env` files (e.g., per-agent) are not supported. → Matches PRD REQ-011 spec.

- **Blocking startup** → The proxy blocks until all upstream servers are initialized. If one server hangs, the entire proxy is delayed until the timeout. → Mitigated by configurable `--startup-timeout` flag and clear error messages naming the failed server.
