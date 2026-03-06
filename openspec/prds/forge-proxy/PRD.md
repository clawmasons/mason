# Forge Proxy — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.

---

## 1. Problem Statement

The Agent Forge System currently depends on [tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy/), an external Go binary, to aggregate MCP servers behind a single proxy endpoint. This dependency is causing critical issues:

- **Stability:** The tbxark/mcp-proxy binary crashes in production, disrupting agent operations with no ability to diagnose or fix the issue.
- **Feature gaps:** The external proxy provides basic tool filtering and passthrough but lacks the governance features forge needs — approval workflows, structured audit logging, credential lifecycle management, and extensible hook pipelines.
- **Naming opacity:** The proxy preserves upstream tool names as-is, making it impossible to tell which app a tool belongs to when multiple MCP servers expose generically-named tools (e.g., `search`, `create`, `list`).
- **Credential fragility:** OAuth-based MCP servers (e.g., Atlassian) require manual reauthentication when tokens expire, breaking autonomous agent workflows.

Without a purpose-built proxy, forge cannot deliver on its governance-as-code thesis. The proxy layer is the hard enforcement boundary — if it's unreliable and feature-poor, the entire permission model is undermined.

---

## 2. Goals

### User Goals
- Agents operate reliably without proxy crashes interrupting work.
- Tool names are self-describing — a human or agent can tell what `github_create_pr` does without checking which MCP server it came from.
- OAuth-based apps automatically reauthenticate without human intervention.
- Dangerous tool calls require explicit human approval before execution.

### Business Goals
- Eliminate dependency on an external, unmaintained proxy binary.
- Enable structured audit logging for compliance and debugging.
- Build the foundation for enterprise governance features (approval routing, cost controls, rate limiting).

### Measurable Outcomes
- Zero proxy crashes in a 30-day period (vs. current crash frequency).
- 100% of tool calls logged with agent, role, app, tool, arguments, result, and duration.
- Approval workflow latency < 500ms from request to SQLite write.

---

## 3. Non-Goals

- **Per-request role isolation:** The proxy enforces the union of all role permissions (the hard boundary). Per-role scoping remains the runtime's responsibility via `AGENTS.md` and task prompts. Dynamic per-request `X-FORGE-Role` header enforcement is out of scope.
- **Multi-agent proxy:** Each agent gets its own proxy instance. Cross-agent proxy aggregation is not in scope.
- **Custom hook plugins:** The hook pipeline is extensible by design, but v1 ships with built-in hooks only (audit log, approval). Plugin loading is future work.
- **Encrypted credential storage:** Credentials come from `.env` files. At-rest encryption of stored tokens in SQLite is future work.
- **Web-based approval UI:** Approvals are resolved via the forge TUI (separate PRD) or direct SQLite writes. No web interface.

---

## 4. User Stories

**US-1:** As an agent operator, I want the MCP proxy to be a stable Node.js process built into forge, so that I don't depend on an external binary that crashes.

**US-2:** As an agent operator, I want all tools exposed through the proxy to be prefixed with their app name (e.g., `github_create_pr`), so that I can identify what each tool does at a glance.

**US-3:** As an agent operator, I want the proxy to only list tools that the agent's roles permit, so that the agent never sees tools it's not allowed to use.

**US-4:** As an agent operator, I want the proxy to automatically refresh OAuth tokens when they expire, so that agents using Atlassian and similar services don't stall waiting for reauthentication.

**US-5:** As an agent operator, I want certain tool calls to require my approval before executing, so that destructive operations can't happen without my knowledge.

**US-6:** As an agent operator, I want every tool call to be logged with full context (agent, role, app, tool, arguments, result, duration), so that I have a complete audit trail.

**US-7:** As an agent operator, I want to start the proxy with a single command (`forge proxy`), so that setup is simple and consistent.

**US-8:** As an agent operator, I want the proxy to also pass through MCP resources and prompts from upstream servers, so that agents have full access to the capabilities their apps provide.

---

## 5. Requirements

### P0 — Must-Have

**REQ-001: Native MCP Proxy Server**

The `forge proxy` command starts a Node.js MCP server using `@modelcontextprotocol/sdk`. The server name is always `forge`. It exposes a single SSE or streamable-http endpoint that runtimes connect to as their sole MCP server.

Acceptance criteria:
- Given a resolved agent package, when `forge proxy` is run, then a MCP server starts on the configured port (default 9090).
- Given the proxy is running, when a runtime connects via SSE or streamable-http, then it receives a valid MCP server with the name `forge`.

**REQ-002: Upstream MCP Client Management**

The proxy creates one MCP client per app declared in the agent's dependency graph. All upstream clients are initialized eagerly on startup. The proxy blocks until all upstream servers are connected and initialized.

Acceptance criteria:
- Given an agent with 3 apps (2 stdio, 1 remote), when the proxy starts, then it spawns 2 stdio processes and connects to 1 remote URL.
- Given an upstream server takes 10 seconds to start, when the proxy is initializing, then it waits for all servers before accepting downstream connections.
- Given an upstream server fails to start, when the startup timeout is exceeded, then the proxy exits with a descriptive error naming the failed server.

**REQ-003: Tool Name Prefixing**

All tools from upstream servers are exposed with the naming convention `<appname>_<toolname>`, where `<appname>` is the app's short name (npm scope and type prefix stripped). The original tool description is preserved. The tool's input schema is passed through unchanged.

Acceptance criteria:
- Given app `@clawmasons/app-github` exposes tool `create_pr`, when a runtime calls `tools/list`, then the tool appears as `github_create_pr`.
- Given app `@clawmasons/app-slack` exposes tool `send_message`, when a runtime calls `tools/list`, then the tool appears as `slack_send_message`.
- Given a runtime calls `tools/call` with name `github_create_pr`, then the proxy strips the prefix and forwards `create_pr` to the github upstream server.

**REQ-004: Role-Based Tool Filtering**

The proxy computes the union of all role permission allow-lists and only exposes tools in that union. Tools that exist on upstream servers but are not in any role's allow-list are excluded from `tools/list` and rejected on `tools/call`.

Acceptance criteria:
- Given role A allows `[create_pr, list_repos]` on app-github and role B allows `[list_repos, get_pr]` on app-github, when a runtime calls `tools/list`, then github tools `[github_create_pr, github_list_repos, github_get_pr]` are listed.
- Given a runtime calls `tools/call` with name `github_delete_repo` which is not in any role's allow-list, then the proxy returns an error without forwarding the request upstream.

**REQ-005: Audit Logging**

Every tool call is logged to a SQLite database at `~/.forge/forge.db`. The audit log captures: id, agent name, role name, app name, tool name, arguments (JSON), result summary, status (success/error/denied/timeout), duration in milliseconds, and timestamp.

Acceptance criteria:
- Given the proxy handles a tool call, when the call completes, then a row is inserted into the `audit_log` table with all required fields.
- Given a tool call is denied by the tool filter, then an audit log entry is written with status `denied`.
- Given the SQLite database does not exist, when the proxy starts, then it creates `~/.forge/forge.db` with the required schema.

**REQ-006: Approval Workflow**

Tool calls matching patterns in `role.constraints.requireApprovalFor` are paused pending human approval. The proxy writes an approval request to the `approval_requests` table in SQLite and polls for a status change. Requests have a 5-minute TTL and auto-deny on expiry.

Acceptance criteria:
- Given a role has `requireApprovalFor: ["github_delete_*"]`, when a runtime calls `github_delete_repo`, then the proxy writes a pending approval request to SQLite and blocks.
- Given an approval request is written, when the TUI updates its status to `approved`, then the proxy forwards the call upstream and returns the result.
- Given an approval request is written, when 5 minutes elapse without resolution, then the proxy auto-denies the request and returns an error to the runtime.
- Given an approval request is written, when the TUI updates its status to `denied`, then the proxy returns an error to the runtime without forwarding.

**REQ-007: Approval Pattern Matching**

The `requireApprovalFor` array supports glob patterns matched against the prefixed tool name (`<appname>_<toolname>`). Patterns use `*` as a wildcard.

Acceptance criteria:
- Given `requireApprovalFor: ["github_delete_*"]`, when `github_delete_repo` is called, then approval is required.
- Given `requireApprovalFor: ["*_send_*"]`, when `slack_send_message` is called, then approval is required.
- Given `requireApprovalFor: ["github_create_pr"]`, when `github_list_repos` is called, then no approval is required.

**REQ-008: SQLite Database Schema**

The shared SQLite database at `~/.forge/forge.db` uses WAL mode for concurrent access from multiple proxy instances and the forge TUI. Tables:

```sql
CREATE TABLE IF NOT EXISTS approval_requests (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL,
  resolved_at  TEXT,
  resolved_by  TEXT,
  ttl_seconds  INTEGER NOT NULL DEFAULT 300
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           TEXT PRIMARY KEY,
  agent_name   TEXT NOT NULL,
  role_name    TEXT NOT NULL,
  app_name     TEXT NOT NULL,
  tool_name    TEXT NOT NULL,
  arguments    TEXT,
  result       TEXT,
  status       TEXT NOT NULL,
  duration_ms  INTEGER,
  timestamp    TEXT NOT NULL
);
```

Acceptance criteria:
- Given `~/.forge/forge.db` does not exist, when the proxy starts, then it creates the file and both tables.
- Given multiple proxy instances are running, when they write concurrently, then WAL mode prevents lock contention.

**REQ-009: Resource and Prompt Passthrough**

The proxy forwards MCP `resources/list`, `resources/read`, `prompts/list`, and `prompts/get` requests to upstream servers. Resource and prompt names are prefixed with `<appname>_` following the same convention as tools. Resources and prompts are not filtered by role permissions (they are read-only).

Acceptance criteria:
- Given app-github exposes resource `repo://owner/name` with name `repository`, when a runtime calls `resources/list`, then it appears as `github_repository`.
- Given app-github exposes prompt `pr_review`, when a runtime calls `prompts/list`, then it appears as `github_pr_review`.
- Given a runtime calls `resources/read` for `github_repository`, then the proxy strips the prefix and forwards to the github upstream.

**REQ-010: Configuration from Agent Package**

The proxy reads its configuration from the agent package in the current working directory. It discovers packages, resolves the dependency graph, and computes tool filters using the existing `discover` → `resolve` → `computeToolFilters` pipeline. No separate config file is needed.

Acceptance criteria:
- Given `forge proxy` is run in an agent monorepo root, then it discovers all packages, resolves the agent, and starts with the correct tool filters.
- Given the workspace has no agent package, when `forge proxy` is run, then it exits with a descriptive error.

**REQ-011: Credential Loading from .env**

The proxy loads credentials from `.env` files in the workspace root. Environment variables referenced in app `env` fields (via `${VAR}` syntax) are resolved from the loaded environment. The proxy passes resolved environment variables to stdio upstream processes and includes them as headers/params for remote upstreams as configured.

Acceptance criteria:
- Given an app has `env: { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }` and `.env` contains `GITHUB_TOKEN=ghp_abc123`, when the proxy spawns the stdio process, then `GITHUB_TOKEN=ghp_abc123` is in the process environment.

### P1 — Nice-to-Have

**REQ-012: OAuth Token Refresh**

Apps can declare an `auth` field in their forge metadata describing their authentication mechanism. For OAuth2 apps, the proxy monitors upstream responses for 401 errors and automatically refreshes the access token using the stored refresh token.

App schema extension:
```json
{
  "forge": {
    "type": "app",
    "auth": {
      "type": "oauth2",
      "tokenUrl": "https://auth.atlassian.com/oauth/token",
      "clientId": "${ATLASSIAN_CLIENT_ID}",
      "clientSecret": "${ATLASSIAN_CLIENT_SECRET}",
      "refreshTokenEnvVar": "ATLASSIAN_REFRESH_TOKEN",
      "accessTokenEnvVar": "ATLASSIAN_ACCESS_TOKEN",
      "scopes": ["read:jira-work", "write:jira-work"]
    }
  }
}
```

Acceptance criteria:
- Given an app has `auth.type: "oauth2"` and the upstream returns a 401 error, then the proxy uses the refresh token to obtain a new access token.
- Given a token refresh succeeds for a stdio app, then the proxy restarts the upstream process with the new token in its environment and retries the failed request.
- Given a token refresh succeeds for a remote app, then the proxy updates the connection and retries the failed request.
- Given a token refresh fails, then the proxy logs the failure and returns the original 401 error to the runtime.
- Given a token is refreshed, then the new access token (and updated refresh token, if provided) are stored in the SQLite `credentials` table for persistence across proxy restarts.

**REQ-013: Hook Pipeline Architecture**

Tool calls pass through a pre-hook and post-hook pipeline. Hooks are executed in order and can short-circuit the pipeline (e.g., approval denial prevents execution). Built-in hooks for v1: `audit_log` (pre + post) and `approval` (pre). The pipeline is designed for future extension with hooks like rate limiting, cost estimation, and response transformation.

Acceptance criteria:
- Given a tool call arrives, then pre-hooks execute in order: audit_log (log request), then approval (check if approval required).
- Given the tool call completes, then post-hooks execute: audit_log (log result).
- Given a pre-hook denies the call, then subsequent hooks and the upstream call are skipped.

**REQ-014: Startup Timeout Configuration**

The proxy supports a configurable timeout for upstream server initialization (default: 60 seconds). If any upstream server fails to initialize within the timeout, the proxy exits with a descriptive error.

Acceptance criteria:
- Given `forge proxy --startup-timeout 30`, when an upstream server takes 45 seconds to start, then the proxy exits with an error after 30 seconds.

### P2 — Future Consideration

**REQ-015: Per-Request Role Enforcement**

A future extension where the proxy reads an `X-Forge-Role` header and dynamically applies per-role tool filtering, eliminating the soft boundary layer.

**REQ-016: Webhook Approval Routing**

Approval requests can be routed to external systems (Slack, email, custom webhooks) in addition to the SQLite-based local approval flow.

**REQ-017: Rate Limiting Hook**

A configurable rate limiter that throttles tool calls per agent, per role, or per app to prevent runaway agents from overwhelming upstream services.

**REQ-018: Cost Estimation Hook**

A pre-hook that estimates the cost of a tool call (e.g., API credits consumed) and blocks calls that would exceed a configured budget.

---

## 6. Architecture

### 6.1 High-Level Architecture

```
                    ┌───────────────────────────────────────────────────────┐
                    │                 forge proxy (Node.js)                  │
                    │                                                       │
Runtime ──MCP──►    │  ┌─────────────────────────────────────────────────┐ │
(Claude Code,       │  │  MCP Server ("forge")                           │ │
 Codex, etc.)       │  │  Transport: SSE or streamable-http              │ │
                    │  │                                                 │ │
                    │  │  tools/list  → role-filtered, <app>_ prefixed   │ │
                    │  │  resources/* → <app>_ prefixed, passthrough     │ │
                    │  │  prompts/*   → <app>_ prefixed, passthrough     │ │
                    │  └──────────────────────┬──────────────────────────┘ │
                    │                         │                            │
                    │              ┌──────────▼──────────┐                 │
                    │              │   Hook Pipeline      │                │
                    │              │                      │                │
                    │              │   PRE:  audit → approval             │
                    │              │   POST: audit                        │
                    │              └──────────┬──────────┘                 │
                    │                         │                            │
                    │  ┌──────────────────────▼───────────────────────┐   │
                    │  │  Upstream MCP Clients (one per app)          │   │
                    │  │                                              │   │
                    │  │  ┌─────────┐  ┌─────────┐  ┌────────────┐  │   │
                    │  │  │ github  │  │  slack   │  │ atlassian  │  │   │
                    │  │  │ (stdio) │  │ (stdio)  │  │  (remote)  │  │   │
                    │  │  └─────────┘  └─────────┘  └────────────┘  │   │
                    │  └─────────────────────────────────────────────┘   │
                    │                                                       │
                    │  ┌──────────────────────────────────────────────┐    │
                    │  │  SQLite (~/.forge/forge.db, WAL mode)        │    │
                    │  │  - audit_log                                 │    │
                    │  │  - approval_requests                        │    │
                    │  │  - credentials (P1: OAuth tokens)           │    │
                    │  └──────────────────────────────────────────────┘    │
                    └───────────────────────────────────────────────────────┘
```

### 6.2 Startup Sequence

```
forge proxy
  │
  ├─1─ Discover packages in workspace (apps/, roles/, agents/, etc.)
  ├─2─ Resolve agent dependency graph → ResolvedAgent
  ├─3─ Compute role-filtered tool allow-lists (union of all roles)
  ├─4─ Load credentials from .env
  ├─5─ Open SQLite (~/.forge/forge.db), create tables if needed, enable WAL
  ├─6─ Start all upstream MCP clients in parallel
  │      ├── stdio: spawn process, send initialize, wait for response
  │      ├── remote: connect, send initialize, wait for response
  │      └── BLOCK until all ready (with configurable timeout)
  ├─7─ Enumerate upstream tools/resources/prompts
  │      ├── Filter tools by role-permission union
  │      ├── Prefix all names: <appname>_<original_name>
  │      └── Build internal routing table: prefixed_name → (app, original_name)
  ├─8─ Initialize hook pipeline (audit_log, approval)
  ├─9─ Start MCP server ("forge") on configured port
  └─10─ Log "forge proxy ready" — accepting connections
```

### 6.3 Tool Call Flow

```
Runtime calls tools/call("github_create_pr", { ... })
  │
  ├─1─ Lookup routing table: github_create_pr → (app=github, tool=create_pr)
  │      └── If not found → return error "unknown tool"
  ├─2─ Pre-hooks:
  │      ├── audit_log: write request to audit_log table
  │      └── approval: check requireApprovalFor patterns
  │           ├── No match → continue
  │           └── Match → write to approval_requests, poll for resolution
  │                ├── Approved → continue
  │                ├── Denied → return error, audit log "denied"
  │                └── Timeout (5 min) → auto-deny, return error
  ├─3─ Forward: call create_pr on github upstream client
  │      └── If 401 + auth.type=oauth2 → refresh token, restart, retry (P1)
  ├─4─ Post-hooks:
  │      └── audit_log: update with result, status, duration
  └─5─ Return result to runtime
```

### 6.4 Integration with Existing Codebase

The forge proxy replaces the tbxark/mcp-proxy dependency but reuses the existing forge infrastructure:

| Existing Module | Reuse |
|----------------|-------|
| `resolver/discover.ts` | Package discovery from workspace directories |
| `resolver/resolve.ts` | Dependency graph resolution → `ResolvedAgent` |
| `generator/toolfilter.ts` | `computeToolFilters()` for role-permission unions |
| `generator/toolfilter.ts` | `getAppShortName()` for app name prefixing |
| `schemas/*.ts` | Package schema validation (app, role, agent) |

New modules to create:

| Module | Purpose |
|--------|---------|
| `proxy/server.ts` | MCP server (downstream-facing) |
| `proxy/upstream.ts` | Upstream MCP client manager |
| `proxy/router.ts` | Tool/resource/prompt routing table |
| `proxy/hooks.ts` | Hook pipeline (audit, approval) |
| `proxy/db.ts` | SQLite connection, schema, queries |
| `proxy/credentials.ts` | Credential loading + OAuth refresh (P1) |
| `cli/commands/proxy.ts` | `forge proxy` CLI command |

### 6.5 Agent Schema Changes

The `proxy` field in the agent schema changes from referencing an external Docker image to configuring the built-in forge proxy:

**Before:**
```json
{
  "proxy": {
    "image": "ghcr.io/tbxark/mcp-proxy:latest",
    "port": 9090,
    "type": "sse"
  }
}
```

**After:**
```json
{
  "proxy": {
    "port": 9090,
    "type": "sse"
  }
}
```

The `image` field is removed. The proxy is now the forge binary itself running `forge proxy`.

### 6.6 App Schema Extension (P1)

The `auth` field is added to the app schema for credential lifecycle management:

```typescript
const authSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("oauth2"),
    tokenUrl: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
    refreshTokenEnvVar: z.string(),
    accessTokenEnvVar: z.string(),
    scopes: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal("api_key"),
    envVar: z.string(),
  }),
]);

// Added to appForgeFieldSchema:
auth: authSchema.optional(),
```

The `api_key` variant is a no-op (just documents which env var holds the key). The `oauth2` variant enables automatic token refresh.

### 6.7 Credential Table (P1)

```sql
CREATE TABLE IF NOT EXISTS credentials (
  id             TEXT PRIMARY KEY,
  app_name       TEXT NOT NULL UNIQUE,
  cred_type      TEXT NOT NULL,
  access_token   TEXT,
  refresh_token  TEXT,
  expires_at     TEXT,
  metadata       TEXT,
  updated_at     TEXT NOT NULL
);
```

On startup, the proxy checks the credentials table for stored tokens. If a valid (non-expired) access token exists, it uses that instead of the `.env` value. On refresh, it updates the table.

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should the proxy Dockerfile be updated to use `forge proxy` as entrypoint instead of the tbxark/mcp-proxy binary, or should the proxy run as a sidecar alongside the runtime? | Engineering | Yes |
| Q2 | For stdio apps, restarting the process on token refresh kills in-flight requests. Should we queue requests during restart, or accept the interruption? | Engineering | No |
| Q3 | Should `requireApprovalFor` patterns be defined at the agent level (cross-role) in addition to per-role? | Product | No |
| Q4 | What is the maximum number of concurrent upstream MCP servers we need to support? Does this affect the startup timeout default? | Engineering | No |

---

## 8. Timeline Considerations

### Phase 1: Core Proxy (P0)
- Native MCP server + upstream client management
- Tool name prefixing + role-based filtering
- Resource and prompt passthrough
- SQLite audit logging
- Approval workflow with SQLite + 5-minute TTL
- `forge proxy` CLI command
- Update proxy Dockerfile generation

### Phase 2: Credential Management (P1)
- App schema `auth` extension
- OAuth2 token refresh flow
- SQLite credential persistence
- Hook pipeline formalization

### Phase 3: Advanced Governance (P2)
- Per-request role enforcement
- Webhook approval routing
- Rate limiting + cost estimation hooks
