# Forge Proxy — Implementation Plan

**PRD:** [openspec/prds/forge-proxy/PRD.md](./PRD.md)
**Phase:** P0 (Core Proxy)

---

## Implementation Steps

### CHANGE 1: SQLite Database Module

Create `src/proxy/db.ts` — the shared SQLite database layer for audit logging and approval workflows.

**PRD refs:** REQ-008 (SQLite Database Schema)

**Summary:** Add a SQLite module that opens/creates `~/.forge/forge.db` with WAL mode, creates the `audit_log` and `approval_requests` tables if they don't exist, and exports typed insert/query functions for both tables.

**User Story:** As a developer building the proxy hooks, I need a tested database layer I can import and call `insertAuditLog()` or `createApprovalRequest()` without worrying about connection management or schema setup.

**Scope:**
- New file: `src/proxy/db.ts`
- New dependency: `better-sqlite3` (synchronous SQLite for Node.js)
- New test: `tests/proxy/db.test.ts`
- Functions: `openDatabase(dbPath?)`, `insertAuditLog(entry)`, `queryAuditLog(filters?)`, `createApprovalRequest(req)`, `getApprovalRequest(id)`, `updateApprovalStatus(id, status, resolvedBy?)`
- Schema matches PRD §5 REQ-008 exactly (approval_requests + audit_log tables)
- WAL mode enabled on open

**Testable output:** Unit tests that create an in-memory (or temp file) database, verify both tables exist, insert rows, query them back, and verify WAL mode is active.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-04-sqlite-database-module/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-04-sqlite-database-module/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-04-sqlite-database-module/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-04-sqlite-database-module/tasks.md)
- **Spec:** [sqlite-database/spec.md](../../openspec/specs/sqlite-database/spec.md)
- **Source:** `src/proxy/db.ts`
- **Tests:** `tests/proxy/db.test.ts` (16 tests)

---

### CHANGE 2: Upstream MCP Client Manager

Create `src/proxy/upstream.ts` — manages one MCP client connection per app (stdio or remote).

**PRD refs:** REQ-002 (Upstream MCP Client Management)

**Summary:** Build a manager that takes a list of `ResolvedApp` objects, creates an MCP client for each (stdio: spawn process; remote: connect to URL), initializes them in parallel with a configurable timeout, and exposes their tool/resource/prompt lists.

**User Story:** As a developer building the proxy server, I need to call `manager.initialize()` and then `manager.getTools(appName)` or `manager.callTool(appName, toolName, args)` to interact with upstream MCP servers.

**Scope:**
- New file: `src/proxy/upstream.ts`
- New dependency: `@modelcontextprotocol/sdk` (MCP SDK — client APIs)
- New test: `tests/proxy/upstream.test.ts`
- Class: `UpstreamManager`
  - `constructor(apps: { name: string; app: ResolvedApp; env?: Record<string,string> }[])`
  - `initialize(timeoutMs?: number): Promise<void>` — connect all clients in parallel, throw if any fails within timeout
  - `getTools(appName): Tool[]` — list tools for an app
  - `getResources(appName): Resource[]` — list resources for an app
  - `getPrompts(appName): Prompt[]` — list prompts for an app
  - `callTool(appName, toolName, args): Promise<Result>` — forward a tool call
  - `readResource(appName, uri): Promise<Result>` — forward a resource read
  - `getPrompt(appName, name, args): Promise<Result>` — forward a prompt get
  - `shutdown(): Promise<void>` — close all clients
- Reuses: `ResolvedApp` type from `src/resolver/types.ts`

**Testable output:** Unit tests with mocked MCP SDK clients verifying: transport factory creates correct transport types, parallel initialization with timeout, tool/resource/prompt listing with pagination, tool call/resource read/prompt get forwarding, graceful shutdown with error tolerance.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-upstream-mcp-client-manager/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-upstream-mcp-client-manager/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-upstream-mcp-client-manager/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-upstream-mcp-client-manager/tasks.md)
- **Spec:** [upstream-mcp-client/spec.md](../../openspec/specs/upstream-mcp-client/spec.md)
- **Source:** `src/proxy/upstream.ts`
- **Tests:** `tests/proxy/upstream.test.ts` (24 tests)

---

### CHANGE 3: Tool Router — Prefixing & Role Filtering

Create `src/proxy/router.ts` — builds the routing table mapping prefixed tool names to upstream apps, with role-based filtering.

**PRD refs:** REQ-003 (Tool Name Prefixing), REQ-004 (Role-Based Tool Filtering)

**Summary:** Given upstream tools from the `UpstreamManager` and tool filters from `computeToolFilters()`, build a routing table that: (1) prefixes all tool names as `<appShortName>_<toolName>`, (2) excludes tools not in any role's allow-list, and (3) routes incoming prefixed calls back to the correct upstream app and original tool name.

**User Story:** As a runtime connected to the proxy, when I call `tools/list` I see `github_create_pr` (not `create_pr`), and when I call `tools/call("github_create_pr", {...})` the proxy knows to forward `create_pr` to the github upstream.

**Scope:**
- New file: `src/proxy/router.ts`
- New test: `tests/proxy/router.test.ts`
- Reuses: `getAppShortName()` from `src/generator/toolfilter.ts`
- Reuses: `computeToolFilters()` from `src/generator/toolfilter.ts`
- Types:
  ```typescript
  interface RouteEntry {
    appName: string;        // full package name
    appShortName: string;   // e.g., "github"
    originalToolName: string;
    prefixedToolName: string;
    tool: Tool;             // MCP Tool object with prefixed name
  }
  ```
- Class: `ToolRouter`
  - `constructor(upstreamTools: Map<string, Tool[]>, toolFilters: Map<string, ToolFilter>)`
  - `listTools(): Tool[]` — returns all prefixed, filtered tools
  - `resolve(prefixedName: string): RouteEntry | null` — lookup routing entry
  - `static prefixName(appShortName: string, toolName: string): string`
  - `static unprefixName(appShortName: string, prefixedName: string): string`

**Testable output:** Unit tests that build a router with mock upstream tools and filters, verify: (a) `listTools()` returns prefixed names, (b) filtered tools are excluded, (c) `resolve()` correctly maps back to app + original name, (d) unknown tools return null.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-tool-router/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-tool-router/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-tool-router/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-tool-router/tasks.md)
- **Spec:** [tool-router/spec.md](../../openspec/specs/tool-router/spec.md)
- **Source:** `src/proxy/router.ts`
- **Tests:** `tests/proxy/router.test.ts` (18 tests)

---

### CHANGE 4: Core Proxy Server — tools/list & tools/call

Create `src/proxy/server.ts` — the downstream-facing MCP server that wires together upstream clients, router, and serves tool requests.

**PRD refs:** REQ-001 (Native MCP Proxy Server)

**Summary:** Create an MCP server named `"forge"` using `@modelcontextprotocol/sdk` that serves SSE or streamable-http on a configurable port. It delegates `tools/list` to the `ToolRouter` and `tools/call` to the `UpstreamManager` via the router's lookup. This is the first change that produces a **running proxy** you can connect to.

**User Story:** As an agent operator, I start the proxy and point my runtime (Claude Code) at it. The runtime sees all my prefixed, filtered tools and can call them. This replaces the external tbxark/mcp-proxy for tool operations.

**Scope:**
- New file: `src/proxy/server.ts`
- New test: `tests/proxy/server.test.ts`
- Dependencies: `@modelcontextprotocol/sdk` (server APIs)
- Class/function: `ForgeProxyServer`
  - `constructor(config: { port: number; transport: "sse" | "streamable-http"; router: ToolRouter; upstream: UpstreamManager })`
  - `start(): Promise<void>` — start listening
  - `stop(): Promise<void>` — graceful shutdown
  - Registers MCP handlers for `tools/list` and `tools/call`
  - `tools/list` → `router.listTools()`
  - `tools/call(name, args)` → `router.resolve(name)` → `upstream.callTool(appName, originalName, args)`
  - Returns error for unknown/filtered tools

**Testable output:** Start the proxy with the example filesystem app as upstream. Connect an MCP client to the proxy. Verify `tools/list` returns `filesystem_read_file`, `filesystem_write_file`, etc. Call `filesystem_read_file` and get a result. Verify unknown tool call returns an error.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-core-proxy-server/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-core-proxy-server/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-core-proxy-server/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-core-proxy-server/tasks.md)
- **Spec:** [proxy-server/spec.md](../../openspec/specs/proxy-server/spec.md)
- **Source:** `src/proxy/server.ts`
- **Tests:** `tests/proxy/server.test.ts` (12 tests)

---

### CHANGE 5: Audit Logging Hook

Add audit logging to the proxy's tool call pipeline.

**PRD refs:** REQ-005 (Audit Logging)

**Summary:** Wrap every `tools/call` in pre/post audit logging. Before the call: insert a row with request details. After the call: update with result, status (success/error/denied), and duration in milliseconds. Denied calls (unknown/filtered tools) also get logged.

**User Story:** As an agent operator, after my agent runs for an hour, I can query `~/.forge/forge.db` and see every tool call it made — what it called, what arguments it passed, whether it succeeded, and how long it took.

**Scope:**
- Modify: `src/proxy/server.ts` — add hook execution around tool calls
- New file: `src/proxy/hooks/audit.ts` — audit hook implementation
- Uses: `insertAuditLog()` from `src/proxy/db.ts` (CHANGE 1)
- New test: `tests/proxy/hooks/audit.test.ts`
- Hook interface:
  ```typescript
  interface HookContext {
    agentName: string;
    roleName: string;
    appName: string;
    toolName: string;
    prefixedToolName: string;
    arguments: unknown;
  }
  ```
- Pre-hook: records start time, writes initial audit entry
- Post-hook: updates entry with result, status, duration_ms

**Testable output:** Start proxy, call a tool, query `audit_log` table — verify row exists with correct agent_name, app_name, tool_name, arguments, result, status="success", and duration_ms > 0. Call a filtered tool — verify row with status="denied".

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-audit-logging-hook/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-audit-logging-hook/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-audit-logging-hook/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-audit-logging-hook/tasks.md)
- **Spec:** [audit-logging-hook/spec.md](../../openspec/specs/audit-logging-hook/spec.md)
- **Source:** `src/proxy/hooks/audit.ts`, `src/proxy/server.ts` (modified)
- **Tests:** `tests/proxy/hooks/audit.test.ts` (9 tests), `tests/proxy/server.test.ts` (4 new audit tests)

---

### CHANGE 6: Approval Workflow Hook

Add the approval gate to the proxy's tool call pipeline.

**PRD refs:** REQ-006 (Approval Workflow), REQ-007 (Approval Pattern Matching)

**Summary:** Before executing a tool call, check if the prefixed tool name matches any `requireApprovalFor` glob patterns from the agent's role constraints. If it matches: write a pending approval request to SQLite, then poll for status changes (approved/denied) with a 5-minute TTL. Auto-deny on expiry.

**User Story:** As an agent operator, I've configured `requireApprovalFor: ["github_delete_*"]`. My agent tries to call `github_delete_repo`. The call blocks, I see the pending request in the forge TUI (or SQLite), I approve it, and the call proceeds. If I don't respond in 5 minutes, it auto-denies.

**Scope:**
- New file: `src/proxy/hooks/approval.ts`
- Uses: `createApprovalRequest()`, `getApprovalRequest()` from `src/proxy/db.ts`
- New test: `tests/proxy/hooks/approval.test.ts`
- Glob pattern matching: `*` wildcard using a simple matcher (e.g., `minimatch` or hand-rolled since patterns are simple)
- Functions:
  - `matchesApprovalPattern(prefixedToolName: string, patterns: string[]): boolean`
  - `requestApproval(context: HookContext, db: Database): Promise<"approved" | "denied" | "timeout">`
- Polling: check `approval_requests` status every 1 second, timeout after `ttl_seconds` (default 300)
- On timeout: update status to `denied`, set `resolved_by` to `"auto-timeout"`

**Testable output:** Unit test: verify glob matching (`github_delete_*` matches `github_delete_repo`, `*_send_*` matches `slack_send_message`). Integration test: create approval request → verify it's pending in DB → update status to "approved" externally → verify hook returns "approved". Test TTL: create request with short TTL (2s) → verify auto-deny.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-approval-workflow-hook/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-approval-workflow-hook/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-approval-workflow-hook/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-approval-workflow-hook/tasks.md)
- **Spec:** [approval-workflow-hook/spec.md](../../openspec/specs/approval-workflow-hook/spec.md)
- **Source:** `src/proxy/hooks/approval.ts`, `src/proxy/server.ts` (modified)
- **Tests:** `tests/proxy/hooks/approval.test.ts` (18 tests), `tests/proxy/server.test.ts` (4 new approval tests)

---

### CHANGE 7: Resource & Prompt Passthrough

Extend the proxy server to forward MCP resources and prompts from upstream servers.

**PRD refs:** REQ-009 (Resource and Prompt Passthrough)

**Summary:** Add handlers for `resources/list`, `resources/read`, `prompts/list`, and `prompts/get` to the MCP server. Resources and prompts are prefixed with `<appShortName>_` following the same convention as tools. They are NOT filtered by role permissions (read-only passthrough).

**User Story:** As an agent runtime, when I call `resources/list` through the proxy I see `github_repository` (not `repository`). When I call `prompts/list` I see `github_pr_review`. I can read any resource or get any prompt — they aren't restricted by roles.

**Scope:**
- Modify: `src/proxy/router.ts` — add resource/prompt routing (similar to tool routing but without filtering)
- Modify: `src/proxy/server.ts` — register handlers for resources/list, resources/read, prompts/list, prompts/get
- Extend test: `tests/proxy/server.test.ts`
- Resource routing: prefix names, route reads back to correct upstream
- Prompt routing: prefix names, route gets back to correct upstream

**Testable output:** Start proxy with an upstream that exposes resources/prompts. Verify `resources/list` returns prefixed names. Call `resources/read` with prefixed name — verify correct data returned from upstream.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-resource-prompt-passthrough/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-resource-prompt-passthrough/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-resource-prompt-passthrough/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-resource-prompt-passthrough/tasks.md)
- **Spec:** [resource-prompt-passthrough/spec.md](../../openspec/specs/resource-prompt-passthrough/spec.md)
- **Source:** `src/proxy/router.ts` (ResourceRouter, PromptRouter), `src/proxy/server.ts` (modified)
- **Tests:** `tests/proxy/router.test.ts` (14 new tests), `tests/proxy/server.test.ts` (8 new tests)

---

### CHANGE 8: `forge proxy` CLI Command + Credential Loading

Create the `forge proxy` CLI command that ties everything together.

**PRD refs:** REQ-010 (Configuration from Agent Package), REQ-011 (Credential Loading from .env), REQ-014 (Startup Timeout Configuration)

**Summary:** Add a `forge proxy` command to the CLI that: discovers packages → resolves the agent → computes tool filters → loads .env credentials → opens SQLite → starts upstream clients → builds routing table → starts the MCP server. Includes `--port` and `--startup-timeout` flags.

**User Story:** As an agent operator, I `cd` into my agent workspace and run `forge proxy`. It discovers my agent, connects to all my MCP apps, and starts serving on port 9090. I point my runtime at it and start working.

**Scope:**
- New file: `src/cli/commands/proxy.ts`
- New file: `src/proxy/credentials.ts` — load `.env` and resolve `${VAR}` references in app env fields
- Modify: `src/cli/index.ts` — register the proxy command
- New test: `tests/cli/proxy.test.ts`
- Reuses: `discoverPackages()` from `src/resolver/discover.ts`
- Reuses: `resolveAgent()` from `src/resolver/resolve.ts`
- Reuses: `computeToolFilters()` from `src/generator/toolfilter.ts`
- Reuses: `getAppShortName()` from `src/generator/toolfilter.ts`
- Startup sequence follows PRD §6.2 steps 1-10
- CLI flags: `--port <number>` (default 9090), `--startup-timeout <seconds>` (default 60), `--agent <name>` (auto-detect if only one agent)

**Testable output:** Run `forge proxy --agent note-taker` in the example workspace. Verify: proxy starts, logs "forge proxy ready", accepts MCP connections on port 9090, tools are prefixed and filtered. Ctrl-C shuts down cleanly.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-proxy-cli-credential-loading/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-proxy-cli-credential-loading/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-proxy-cli-credential-loading/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-proxy-cli-credential-loading/tasks.md)
- **Specs:** [proxy-cli/spec.md](../../openspec/specs/proxy-cli/spec.md), [credential-loading/spec.md](../../openspec/specs/credential-loading/spec.md)
- **Source:** `src/cli/commands/proxy.ts`, `src/proxy/credentials.ts`, `src/cli/commands/index.ts` (modified)
- **Tests:** `tests/cli/proxy.test.ts` (13 tests), `tests/proxy/credentials.test.ts` (16 tests)

---

### CHANGE 9: Docker & Install Pipeline Integration

Update the install pipeline and Docker generation to use the native `forge proxy` instead of tbxark/mcp-proxy.

**PRD refs:** PRD §6.5 (Agent Schema Changes)

**Summary:** Update the agent schema to remove the `proxy.image` field. Update `docker-compose.ts` to generate a proxy service that runs `forge proxy` instead of the external binary. Update `proxy-dockerfile.ts` to build a forge image. Update the install command to stop generating `mcp-proxy/config.json`.

**User Story:** As an agent operator, when I run `forge install` my generated `docker-compose.yml` uses the forge proxy natively — no more external binary dependency.

**Scope:**
- Modify: `src/schemas/agent.ts` — remove `image` from proxy schema
- Modify: `src/compose/docker-compose.ts` — proxy service uses `forge proxy` entrypoint
- Modify: `src/generator/proxy-dockerfile.ts` — build forge image (not mcp-proxy binary)
- Modify: `src/cli/commands/install.ts` — stop generating `mcp-proxy/config.json`
- Deprecate: `src/generator/proxy-config.ts` — no longer needed (proxy reads agent package directly)
- Update tests: `tests/compose/docker-compose.test.ts`, `tests/generator/proxy-dockerfile.test.ts`, `tests/cli/install.test.ts`

**Testable output:** Run `forge install @example/agent-note-taker`. Verify: no `mcp-proxy/config.json` generated, `docker-compose.yml` proxy service uses `forge proxy` command, Dockerfile builds forge image. Existing tests updated and passing.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-docker-install-pipeline/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-docker-install-pipeline/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-docker-install-pipeline/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-docker-install-pipeline/tasks.md)
- **Spec:** [docker-install-pipeline/spec.md](../../openspec/specs/docker-install-pipeline/spec.md)
- **Source:** `src/schemas/agent.ts`, `src/resolver/types.ts`, `src/compose/docker-compose.ts`, `src/generator/proxy-dockerfile.ts`, `src/cli/commands/install.ts` (all modified)
- **Deprecated:** `src/generator/proxy-config.ts` (no longer imported by install pipeline)
- **Tests:** `tests/compose/docker-compose.test.ts` (19 tests), `tests/generator/proxy-dockerfile.test.ts` (9 tests), `tests/cli/install.test.ts` (26 tests)

---

### CHANGE 10: End-to-End Integration Test

Replace the existing `tests/integration/mcp-proxy.sh` with a comprehensive test of the native forge proxy.

**Summary:** Write an integration test that exercises the full proxy lifecycle: start → connect → list tools (verify prefixed + filtered) → call tool (verify result) → verify audit log → trigger approval flow → verify timeout → shutdown.

**User Story:** As a developer working on the proxy, I run the integration test suite and get confidence that the entire tool call flow works end-to-end, including audit logging and approvals.

**Scope:**
- Replace: `tests/integration/mcp-proxy.sh` with `tests/integration/forge-proxy.test.ts` (or updated shell script)
- Uses example workspace (`example/`) as test fixture
- Test scenarios:
  1. `forge proxy` starts and accepts connections
  2. `tools/list` returns prefixed, filtered tools only
  3. `tools/call` with valid tool returns correct result
  4. `tools/call` with filtered tool returns error + audit log shows "denied"
  5. Audit log populated with correct fields after tool calls
  6. Approval-required tool creates pending request, auto-denies after TTL
  7. Proxy shuts down cleanly on SIGTERM
- Cleanup: remove temp DB after test

**Testable output:** `npx vitest run tests/integration/forge-proxy.test.ts` passes. All 7 scenarios verified (9 tests total).

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-e2e-integration-test/)

- **Proposal:** [proposal.md](../../openspec/changes/archive/2026-03-05-e2e-integration-test/proposal.md)
- **Design:** [design.md](../../openspec/changes/archive/2026-03-05-e2e-integration-test/design.md)
- **Tasks:** [tasks.md](../../openspec/changes/archive/2026-03-05-e2e-integration-test/tasks.md)
- **Spec:** [mcp-proxy-integration-test/spec.md](../../openspec/specs/mcp-proxy-integration-test/spec.md)
- **Test:** `tests/integration/forge-proxy.test.ts` (9 tests)
- **Deprecated:** `tests/integration/mcp-proxy.sh` (replaced by Vitest test)

---

### CHANGE 11: Persist forge.db & Run Proxy as Non-Root

Make the proxy container production-ready by persisting the SQLite database across container restarts and running the proxy process as the non-root `node` user.

**PRD refs:** REQ-008 (SQLite Database Schema — persistence), PRD §2 (reliability goals)

**Summary:** Move the default database path from `~/.forge/forge.db` to `~/.forge/data/forge.db` (isolating it in a `data/` subdirectory). Add `FORGE_DB_PATH` env var override. Mount `./data:/home/node/data` in docker-compose with `FORGE_DB_PATH=/home/node/data/forge.db` so the DB survives container restarts. Add `USER node` to the Dockerfile so the proxy runs as non-root.

**User Story:** As an agent operator, when my proxy container restarts, I don't lose my audit logs and approval requests. The container also runs as non-root for security best practices.

**Scope:**
- Modify: `src/proxy/db.ts` — `FORGE_DB_PATH` env var support, default to `~/.forge/data/forge.db`
- Modify: `src/generator/proxy-dockerfile.ts` — `USER node`, `mkdir`/`chown` for `/home/node/data` and `/logs`
- Modify: `src/compose/docker-compose.ts` — `./data:/home/node/data` volume, `FORGE_DB_PATH` env var
- Update tests: `tests/proxy/db.test.ts`, `tests/generator/proxy-dockerfile.test.ts`, `tests/compose/docker-compose.test.ts`

**Testable output:** All 529 tests pass. Dockerfile contains `USER node`. Docker-compose mounts data volume. DB opens at env var path when set.

**Implemented** — [Archived Change](../../openspec/changes/archive/2026-03-05-active/)

- **Source:** `src/proxy/db.ts`, `src/generator/proxy-dockerfile.ts`, `src/compose/docker-compose.ts` (all modified)
- **Tests:** `tests/proxy/db.test.ts` (17 tests), `tests/generator/proxy-dockerfile.test.ts` (11 tests), `tests/compose/docker-compose.test.ts` (21 tests)
