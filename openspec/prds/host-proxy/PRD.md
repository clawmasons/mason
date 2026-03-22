# Host Proxy — Product Requirements Document

**Version:** 0.1.0 · Draft
**Date:** March 2026
**Author:** ClawForge, Inc.
**Depends on:** forge-proxy PRD (proxy architecture), credential-service PRD (credential resolution)

---

## 1. Problem Statement

The current architecture places the credential service and the MCP proxy in separate processes connected by a purpose-built WebSocket channel (`/ws/credentials`). Approvals rely on SQLite polling inside the Docker container. Audit logs are written to SQLite inside Docker. This design has four structural problems:

1. **Single-purpose WebSocket channel.** The `/ws/credentials` endpoint handles only credential requests. Every new host-to-Docker communication need (approvals, audit events, host MCP servers) would require adding another WebSocket endpoint or overloading this one in an ad-hoc way.

2. **SQLite in Docker.** The proxy's `better-sqlite3` dependency is the heaviest native module in the proxy package. It exists solely to support approval polling and audit logging inside the container, but the container is ephemeral — data written there is lost when the container stops unless volumes are mapped.

3. **Approval UX is broken.** The approval workflow writes a pending row to SQLite and polls for status changes. Nothing resolves those rows today in a production flow — there is no native UI for the operator on the host machine.

4. **No support for host MCP servers.** Some MCP servers (Xcode simulator tools, native GUI automation, hardware-dependent tools) cannot run inside Docker. There is no mechanism for the Docker proxy to route tool calls to MCP servers running on the host machine.

The host proxy feature addresses all four problems by introducing a unified relay protocol, moving persistence to the host, and enabling bidirectional tool routing between Docker and the host.

---

## 2. Goals

### User Goals
- Operators see a native macOS dialog when an agent requests approval for a dangerous tool call, and can approve or deny with a single click.
- MCP servers that require host-native capabilities (Xcode, simulators, macOS accessibility APIs) work seamlessly alongside Docker-based MCP servers, configured declaratively in the role definition.
- Audit logs persist across sessions on the host filesystem, not inside ephemeral Docker containers.

### Technical Goals
- A single multiplexed WebSocket connection (`/ws/relay`) replaces the single-purpose `/ws/credentials` channel.
- The proxy package has zero native module dependencies (`better-sqlite3` is removed).
- The credential service is absorbed into the proxy package — `packages/credential-service` is deleted.
- The CLI starts a "host proxy" (the proxy package in host mode) instead of a standalone credential service.

### Measurable Outcomes
- Proxy Docker image size decreases (no `better-sqlite3` native compilation).
- Approval latency < 2 seconds from Docker proxy request to host proxy presenting the dialog.
- Host MCP server tool calls add < 50ms latency over the relay compared to direct stdio.

---

## 3. Non-Goals

- **Windows or Linux native approval dialogs.** v1 uses `osascript` for macOS only. Non-macOS platforms auto-approve with a warning log.
- **Remote host proxy.** The host proxy runs on the same machine as the CLI. Network-remote host proxy deployment is out of scope.
- **Host MCP server hot-reload.** If a host MCP server crashes, the host proxy does not restart it. The operator must restart the session.
- **Bidirectional resource mounting.** Host MCP servers cannot access Docker filesystem resources.
- **Credential encryption at rest.** Credential values are resolved from plaintext sources (env, .env, keychain). At-rest encryption is future work.
- **Migration tooling for SQLite data.** Existing audit/approval data in `better-sqlite3` databases is abandoned. No migration path is provided.
- **Web UI for approvals.** Approvals use native macOS dialogs only.

---

## 4. Use Cases

### UC-1: Credential Request (Updated Flow)

An agent running in Docker needs a credential (e.g., `GITHUB_TOKEN`). The Docker proxy forwards the request over the relay WebSocket to the host proxy, which resolves it locally and returns the value.

```
Host Machine                              Docker Network
┌──────────────┐                         ┌──────────────────┐    ┌──────────────┐
│  CLI          │                         │  Docker Proxy    │    │  Agent       │
│  └─ Host     │                         │  (port 9090)     │    │  Container   │
│     Proxy    │                         │                  │    │              │
└──────┬───────┘                         └──────┬───────────┘    └──────┬───────┘
       │                                        │                       │
       ├─ WS connect ─────────────────────────>│  /ws/relay             │
       │  (Bearer RELAY_TOKEN)                  │                       │
       │                                        │                       │
       │                                        │<── credential_request ┤
       │                                        │    {key, session_token}│
       │<── relay: credential_request ─────────┤                       │
       │    {id, type, key, agentId, ...}       │                       │
       │                                        │                       │
       ├── resolve credential                   │                       │
       │   (env > keychain > .env)              │                       │
       │                                        │                       │
       ├── relay: credential_response ────────>│                       │
       │   {id, type, key, value, source}       │                       │
       │                                        ├── tool result ───────>│
       │                                        │   {key, value}        │
```

### UC-2: Approval via Native Dialog

An agent calls a tool matching an approval pattern. The Docker proxy sends an approval request over the relay. The host proxy presents a native macOS dialog. The operator clicks Approve or Deny.

```
Host Machine                              Docker Network
┌──────────────┐                         ┌──────────────────┐    ┌──────────────┐
│  Host Proxy  │                         │  Docker Proxy    │    │  Agent       │
└──────┬───────┘                         └──────┬───────────┘    └──────┬───────┘
       │                                        │                       │
       │                                        │<── tools/call ───────┤
       │                                        │    github_delete_repo │
       │                                        │                       │
       │                                        ├── matches approval    │
       │                                        │   pattern             │
       │                                        │                       │
       │<── relay: approval_request ───────────┤                       │
       │    {id, type, tool_name, app_name,     │                       │
       │     arguments, agent_name}             │                       │
       │                                        │                       │
       ├── osascript dialog                     │                       │
       │   "Approve github_delete_repo?"        │                       │
       │   [Approve] [Deny]                     │                       │
       │                                        │                       │
       │   (operator clicks Approve)            │                       │
       │                                        │                       │
       ├── relay: approval_response ──────────>│                       │
       │   {id, type, status: "approved"}       │                       │
       │                                        │                       │
       │                                        ├── forward to upstream │
       │                                        │<── result            │
       │                                        ├── tool result ───────>│
```

### UC-3: Host MCP Server (Xcode Simulator)

A role declares an MCP server with `location: "host"`. The host proxy starts it locally, discovers its tools, and registers them with the Docker proxy over the relay. Agent tool calls are forwarded through the relay.

```
Host Machine                              Docker Network
┌──────────────┐                         ┌──────────────────┐    ┌──────────────┐
│  Host Proxy  │                         │  Docker Proxy    │    │  Agent       │
│  └─ xcode    │                         │                  │    │              │
│     MCP srv  │                         │                  │    │              │
└──────┬───────┘                         └──────┬───────────┘    └──────┬───────┘
       │                                        │                       │
       ├── start xcode MCP server (stdio)       │                       │
       ├── tools/list → discover tools          │                       │
       │                                        │                       │
       ├── relay: mcp_tools_register ─────────>│                       │
       │   {id, type, app_name, tools: [...]}   │                       │
       │                                        ├── create stub routes  │
       │<── relay: mcp_tools_registered ───────┤                       │
       │   {id, type, app_name}                 │                       │
       │                                        │                       │
       │                                        │<── tools/call ───────┤
       │                                        │    xcode_run_sim      │
       │                                        │                       │
       │<── relay: mcp_tool_call ──────────────┤                       │
       │    {id, type, app_name, tool_name,     │                       │
       │     arguments}                         │                       │
       │                                        │                       │
       ├── forward to xcode MCP server          │                       │
       ├── receive result                       │                       │
       │                                        │                       │
       ├── relay: mcp_tool_result ────────────>│                       │
       │   {id, type, result}                   │                       │
       │                                        ├── tool result ───────>│
```

### UC-4: Audit Event Flow

Every tool call handled by the Docker proxy emits an audit event over the relay. The host proxy persists it to a local JSONL file.

```
Host Machine                              Docker Network
┌──────────────┐                         ┌──────────────────┐
│  Host Proxy  │                         │  Docker Proxy    │
│  └─ audit.   │                         │                  │
│     jsonl    │                         │                  │
└──────┬───────┘                         └──────┬───────────┘
       │                                        │
       │                                        ├── tool call handled
       │                                        │   (audit pre+post hook)
       │                                        │
       │<── relay: audit_event ────────────────┤
       │    {id, type, agent_name, tool_name,   │
       │     status, duration_ms, ...}          │
       │                                        │
       ├── append to ~/.mason/data/audit.jsonl  │
```

### UC-5: Role Definition with Host MCP Server

A role author declares MCP servers with `location` to control where they run:

```yaml
metadata:
  name: "@acme/role-ios-dev"
  description: "iOS development role"

apps:
  - name: github
    package: "@acme/app-github"
    tools:
      allow: ["create_pr", "list_repos"]
    # location defaults to "proxy" — runs in Docker

  - name: xcode-sim
    package: "@acme/app-xcode"
    transport: stdio
    command: "npx"
    args: ["-y", "@anthropic/xcode-mcp-server"]
    location: host              # runs on host machine
    tools:
      allow: ["run_simulator", "list_devices"]
```

---

## 5. Architecture

### 5.1 High-Level Architecture

```
Host Machine
┌─────────────────────────────────────────────────────────┐
│  CLI (run-agent / ACP session)                          │
│  │                                                      │
│  └── Host Proxy (proxy package, host mode)              │
│      ├── Credential Resolver (env > keychain > .env)    │
│      ├── Approval Handler (osascript dialogs)           │
│      ├── Audit Writer (JSONL file)                      │
│      ├── Host MCP Servers (stdio clients)               │
│      │   ├── xcode-sim (StdioClientTransport)           │
│      │   └── ...                                        │
│      └── Relay WS Client ──────────────────────┐        │
│                                                 │        │
└─────────────────────────────────────────────────│────────┘
                                                  │
                            WebSocket /ws/relay   │
                            (Bearer RELAY_TOKEN)  │
                                                  │
Docker Network                                    │
┌─────────────────────────────────────────────────│────────┐
│  Docker Proxy Container (port 9090)             │        │
│  ┌──────────────────────────────────────────────┤        │
│  │ Relay Server (WS /ws/relay)  <───────────────┘        │
│  │  ├── Credential request forwarding                    │
│  │  ├── Approval request forwarding                      │
│  │  ├── Audit event emission                             │
│  │  ├── Host tool call forwarding                        │
│  │  └── Host tool registration                           │
│  │                                                       │
│  │ MCP Server                                            │
│  │  ├── tools/list (proxy + host tools)                  │
│  │  ├── tools/call → UpstreamManager | Relay             │
│  │  ├── resources/*, prompts/*                           │
│  │  └── credential_request tool → Relay                  │
│  │                                                       │
│  │ UpstreamManager (proxy-location MCP servers only)     │
│  │  ├── github (stdio)                                   │
│  │  └── slack (stdio)                                    │
│  │                                                       │
│  │ ToolRouter (merged: proxy routes + host stub routes)  │
│  │                                                       │
│  │ NO SQLite · NO better-sqlite3                         │
│  └───────────────────────────────────────────────────────│
│                                                          │
│  Agent Container                                         │
│  └── MCP client → proxy:9090                             │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Relay Message Types

```
Direction: Docker → Host
─────────────────────────────────────────
credential_request     Resolve a credential key
approval_request       Get human approval for a tool call
mcp_tool_call          Forward tool call to host MCP server
audit_event            Log an audit entry (fire-and-forget)

Direction: Host → Docker
─────────────────────────────────────────
credential_response    Return resolved credential value
approval_response      Return approval decision
mcp_tool_result        Return host MCP tool call result
mcp_tools_register     Register host MCP server tools

Direction: Docker → Host (acknowledgment)
─────────────────────────────────────────
mcp_tools_registered   Confirm tool registration
```

### 5.3 Relay Message Schemas

```typescript
// Base
interface RelayMessage {
  id: string;       // UUIDv4, used for request/response correlation
  type: string;     // Message type discriminator
}

// --- Docker → Host ---

interface CredentialRequestMessage extends RelayMessage {
  type: "credential_request";
  key: string;
  agentId: string;
  role: string;
  sessionId: string;
  declaredCredentials: string[];
}

interface ApprovalRequestMessage extends RelayMessage {
  type: "approval_request";
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;       // JSON-encoded
  ttl_seconds: number;
}

interface McpToolCallMessage extends RelayMessage {
  type: "mcp_tool_call";
  app_name: string;
  tool_name: string;        // Original (unprefixed) tool name
  arguments?: Record<string, unknown>;
}

interface AuditEventMessage extends RelayMessage {
  type: "audit_event";
  agent_name: string;
  role_name: string;
  app_name: string;
  tool_name: string;
  arguments?: string;
  result?: string;
  status: "success" | "error" | "denied" | "timeout" | "dropped";
  duration_ms?: number;
  timestamp: string;
}

// --- Host → Docker ---

interface CredentialResponseMessage extends RelayMessage {
  type: "credential_response";
  key: string;
  value?: string;
  source?: string;
  error?: string;
  code?: string;
}

interface ApprovalResponseMessage extends RelayMessage {
  type: "approval_response";
  status: "approved" | "denied";
}

interface McpToolResultMessage extends RelayMessage {
  type: "mcp_tool_result";
  result?: CallToolResult;  // MCP SDK CallToolResult
  error?: string;
}

interface McpToolsRegisterMessage extends RelayMessage {
  type: "mcp_tools_register";
  app_name: string;
  tools: Array<{
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
  }>;
}

// --- Docker → Host (acknowledgment) ---

interface McpToolsRegisteredMessage extends RelayMessage {
  type: "mcp_tools_registered";
  app_name: string;
}
```

### 5.4 New/Modified Module Map

**New modules in `packages/proxy/`:**

| Module | Purpose |
|--------|---------|
| `src/credentials/resolver.ts` | Moved from `packages/credential-service/src/resolver.ts` |
| `src/credentials/service.ts` | Moved from `packages/credential-service/src/service.ts` |
| `src/credentials/keychain.ts` | Moved from `packages/credential-service/src/keychain.ts` |
| `src/credentials/env-file.ts` | Moved from `packages/credential-service/src/env-file.ts` |
| `src/credentials/schemas.ts` | Moved from `packages/credential-service/src/schemas.ts` |
| `src/relay/server.ts` | Docker-side relay WS server (replaces `handlers/credential-relay.ts`) |
| `src/relay/client.ts` | Host-side relay WS client |
| `src/relay/messages.ts` | Relay message type definitions and Zod schemas |
| `src/approvals/handler.ts` | Host-side approval handler |
| `src/approvals/dialog.ts` | macOS `osascript` dialog invocation |
| `src/host-proxy.ts` | Host proxy orchestrator (credentials + approvals + host MCP + relay client) |
| `src/audit/writer.ts` | Host-side audit log writer (JSONL) |

**Deleted modules:**

| Module | Reason |
|--------|--------|
| `src/db.ts` | SQLite removed |
| `src/handlers/credential-relay.ts` | Replaced by `src/relay/server.ts` |
| `packages/credential-service/` | Absorbed into proxy |

**Modified modules:**

| Module | Changes |
|--------|---------|
| `src/server.ts` | Remove `db` from config, use relay for approvals/audit, handle `/ws/relay` upgrade |
| `src/hooks/approval.ts` | Send `approval_request` over relay instead of SQLite polling |
| `src/hooks/audit.ts` | Send `audit_event` over relay instead of SQLite insert |
| `src/router.ts` | Support dynamic route addition for host MCP server stub routes |
| `src/index.ts` | Update exports: remove DB, add relay + host proxy + credentials |

### 5.5 CLI Integration Changes

The CLI (`packages/cli/src/cli/commands/run-agent.ts`) changes:

1. **Import changes:** Replace `@clawmasons/credential-service` imports with `@clawmasons/proxy` host proxy imports.
2. **Startup function:** Replace `defaultStartCredentialService()` with `defaultStartHostProxy()` that creates a `HostProxy` instance.
3. **Token naming:** Rename `CREDENTIAL_PROXY_TOKEN` to `RELAY_TOKEN` in generated compose files and session configs.
4. **Host apps extraction:** When resolving the role, partition apps into `proxyApps` (location=proxy) and `hostApps` (location=host). Pass `hostApps` to the host proxy, `proxyApps` to Docker compose.

---

## 6. Requirements

### P0 — Must-Have

**REQ-001: Generic Relay WebSocket Endpoint**

The Docker proxy exposes a `/ws/relay` WebSocket endpoint that replaces `/ws/credentials`. Authentication uses bearer token (`RELAY_TOKEN` environment variable).

Acceptance criteria:
- Given a running Docker proxy, when the host proxy connects to `/ws/relay` with a valid bearer token, then the WebSocket connection is established.
- Given an invalid bearer token, when the host proxy attempts to connect, then the connection is rejected with HTTP 401.
- Given the `/ws/credentials` endpoint, it no longer exists and returns 404.

**REQ-002: Relay Message Protocol**

All messages on the relay WebSocket conform to a base schema with `id` (UUID) and `type` (string discriminator). Messages are JSON-encoded.

Acceptance criteria:
- Given a message sent over the relay, when parsed, then it has an `id` field (UUIDv4) and a `type` field matching one of the defined message types.
- Given a request message (e.g., `credential_request`), when a response is sent, then the response `id` matches the request `id` for correlation.
- Given an unrecognized message type, when received, then the receiver logs a warning and ignores it.

**REQ-003: Credential Resolution via Relay**

Credential requests flow over the relay instead of a dedicated WebSocket channel.

Acceptance criteria:
- Given an agent calls the `credential_request` tool, when the Docker proxy receives it, then it sends a `credential_request` message over the relay to the host proxy.
- Given the host proxy receives a `credential_request`, when it resolves the credential (env > keychain > .env), then it sends a `credential_response` back over the relay.
- Given the Docker proxy receives the `credential_response`, when it matches the pending request by `id`, then it returns the result to the agent via the MCP tool response.
- Given a credential request times out (default 30s), then the Docker proxy returns an error to the agent.

**REQ-004: Absorb Credential Service into Proxy**

The credential resolution logic from `packages/credential-service` is moved into `packages/proxy/src/credentials/`. The `packages/credential-service` directory is deleted.

Acceptance criteria:
- Given `packages/proxy/src/credentials/resolver.ts`, it contains the `CredentialResolver` class with the same resolution order: session overrides > env > keychain > .env.
- Given `packages/proxy/src/credentials/service.ts`, it contains the `CredentialService` class with `handleRequest()`, `setSessionOverrides()`, and audit logging.
- Given `packages/credential-service/`, it no longer exists in the monorepo.
- Given the CLI imports, all references to `@clawmasons/credential-service` are replaced with `@clawmasons/proxy` imports.

**REQ-005: Host Proxy Mode**

The proxy package supports a "host" mode (in addition to the current "docker" mode). The host proxy is a Node.js process started by the CLI on the host machine.

Acceptance criteria:
- Given the proxy is started in host mode, then it connects to the Docker proxy's `/ws/relay` endpoint as a WebSocket client.
- Given the proxy is started in host mode, then it initializes credential resolution (env > keychain > .env).
- Given the proxy is started in docker mode (default), then it listens on the configured port and accepts relay connections (current behavior, updated endpoint).
- Given the host proxy, when it starts, then it does NOT start an HTTP server or listen on any port.

**REQ-006: CLI Starts Host Proxy Instead of Credential Service**

The CLI's `run-agent` and ACP session flows start a host proxy instance instead of a standalone credential service.

Acceptance criteria:
- Given `run-agent` is invoked, when infrastructure starts, then the CLI creates a host proxy instance (not a `CredentialService` + `CredentialWSClient`).
- Given the host proxy is started, when it connects to the Docker proxy, then credentials, approvals, and audit events flow over the relay.
- Given the `defaultStartCredentialService` function in `run-agent.ts`, it is replaced with a `defaultStartHostProxy` function.

**REQ-007: Approvals via Relay**

Tool calls matching approval patterns are routed to the host proxy for resolution instead of being polled from SQLite.

Acceptance criteria:
- Given a role has `requireApprovalFor: ["github_delete_*"]` and the agent calls `github_delete_repo`, when the Docker proxy's approval hook fires, then it sends an `approval_request` message over the relay.
- Given the host proxy receives an `approval_request`, when it runs `osascript` to display a native macOS dialog, then it presents the tool name and arguments.
- Given the operator clicks "Approve", then the host proxy sends an `approval_response` with `status: "approved"` back over the relay.
- Given the operator clicks "Deny", then the host proxy sends an `approval_response` with `status: "denied"`.
- Given the approval dialog is not answered within the TTL (default 300 seconds), then the host proxy sends an `approval_response` with `status: "denied"`.
- Given a non-macOS host (Linux), then approvals auto-approve with a console log warning (macOS-only for v1).

**REQ-008: Remove SQLite from Proxy Package**

The `better-sqlite3` dependency and `db.ts` module are removed from the proxy package.

Acceptance criteria:
- Given `packages/proxy/package.json`, then `better-sqlite3` is not in `dependencies`.
- Given `packages/proxy/src/db.ts`, it no longer exists.
- Given the proxy's `ProxyServerConfig`, the `db` field is removed.
- Given the approval hook (`hooks/approval.ts`), it no longer imports or uses SQLite — it sends messages over the relay.
- Given the audit hook (`hooks/audit.ts`), it no longer writes to SQLite — it sends `audit_event` messages over the relay.

**REQ-009: Audit Events via Relay**

Audit log entries are sent over the relay to the host proxy instead of being written to SQLite in Docker.

Acceptance criteria:
- Given a tool call is handled by the Docker proxy, when audit pre/post hooks fire, then an `audit_event` message is sent over the relay.
- Given the host proxy receives an `audit_event`, then it appends the entry to `~/.mason/data/audit.jsonl`.
- Given the `audit_event` message, it contains: `agent_name`, `role_name`, `app_name`, `tool_name`, `arguments`, `result`, `status`, `duration_ms`, `timestamp`.

**REQ-010: Host MCP Server Configuration**

App configs in the role schema support a `location` field that determines where the MCP server runs.

Acceptance criteria:
- Given an app config with `location: "host"`, when the role is resolved, then the app is marked for host-side execution.
- Given an app config with `location: "proxy"` or no `location` field, then the app runs inside Docker as today (default behavior).
- Given the `appConfigSchema` in `role-types.ts`, it includes `location: z.enum(["proxy", "host"]).optional().default("proxy")`.
- Given `ResolvedApp` in `types.ts`, it includes a `location: "proxy" | "host"` field.

**REQ-011: Host MCP Server Lifecycle**

The host proxy starts and manages MCP servers declared with `location: "host"`.

Acceptance criteria:
- Given a role has an app with `location: "host"`, `transport: "stdio"`, and a `command`, when the host proxy starts, then it spawns the MCP server process on the host machine using `StdioClientTransport`.
- Given the host MCP server is started, when it completes initialization, then the host proxy discovers its tools via `tools/list`.
- Given the discovered tools, the host proxy sends an `mcp_tools_register` message over the relay containing the tool definitions (name, description, inputSchema) and the app name.
- Given the Docker proxy receives `mcp_tools_register`, then it creates stub route entries in its `ToolRouter` that forward calls back over the relay.
- Given the Docker proxy receives `mcp_tools_register`, then it responds with `mcp_tools_registered` to confirm registration.

**REQ-012: Host MCP Server Tool Call Routing**

Tool calls to host MCP server tools are forwarded over the relay.

Acceptance criteria:
- Given an agent calls a tool belonging to a host MCP server (e.g., `xcode_run_simulator`), when the Docker proxy resolves the route, then it sends an `mcp_tool_call` message over the relay with `app_name`, `tool_name`, and `arguments`.
- Given the host proxy receives an `mcp_tool_call`, when it forwards the call to the local MCP server, then it returns the result as an `mcp_tool_result` message over the relay.
- Given the Docker proxy receives the `mcp_tool_result`, when it matches the pending request by `id`, then it returns the result to the agent.
- Given a host MCP tool call times out (default 60s), then the Docker proxy returns an error to the agent.

### P1 — Should-Have

**REQ-013: Host MCP Server Resource and Prompt Passthrough**

Resources and prompts from host MCP servers are discoverable through the Docker proxy.

Acceptance criteria:
- Given a host MCP server exposes resources, when the host proxy discovers them, then they are included in the `mcp_tools_register` message (extended to include resources and prompts).
- Given the Docker proxy receives registered resources, then `resources/list` includes them with appropriate prefixing.

**REQ-014: Relay Connection Resilience**

The host proxy reconnects to the Docker proxy if the WebSocket connection drops.

Acceptance criteria:
- Given the relay WebSocket connection drops, when the host proxy detects the close, then it attempts to reconnect with exponential backoff (1s, 2s, 4s, max 30s).
- Given reconnection succeeds, then host MCP server tools are re-registered via `mcp_tools_register`.
- Given reconnection fails after 60 seconds, then the host proxy logs an error and exits.

**REQ-015: Host Proxy Audit Persistence**

The host proxy persists audit events to a durable store on the host machine.

Acceptance criteria:
- Given the host proxy receives `audit_event` messages, when it writes them, then they are appended to a JSONL file at `~/.mason/data/audit.jsonl`.
- Given an existing audit file, when new events arrive, then they are appended (not overwritten).

---

## 7. Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| Q1 | Should the `RELAY_TOKEN` be a new name or reuse `CREDENTIAL_PROXY_TOKEN` for backward compatibility during migration? | Engineering | No |
| Q2 | For non-macOS platforms, should approvals auto-approve or auto-deny? Auto-approve is less safe but more ergonomic for Linux development. | Product | Yes |
| Q3 | Should host MCP server tool calls have a separate configurable timeout from credential requests? | Engineering | No |
| Q4 | Should audit events be fire-and-forget (no response expected) or acknowledged? Fire-and-forget is simpler but risks silent data loss. | Engineering | No |
| Q5 | When the relay connection drops mid-tool-call, should in-flight requests to host MCP servers be canceled or allowed to complete? | Engineering | No |
| Q6 | Should the host proxy support `sse` and `streamable-http` transports for host MCP servers, or only `stdio` in v1? | Engineering | No |

---

## 8. Timeline Considerations

### Phase 1: Relay + Credentials + SQLite Removal
REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-008, REQ-009

- Implement relay message protocol and Zod schemas (`relay/messages.ts`)
- Implement relay server (`relay/server.ts`) — replaces `credential-relay.ts`
- Implement relay client (`relay/client.ts`)
- Move credential service into proxy package (`credentials/`)
- Delete `packages/credential-service`
- Wire credential requests through relay
- Remove SQLite from proxy (`db.ts`, `better-sqlite3` dep)
- Update audit hooks to emit `audit_event` over relay
- Implement host-side audit writer (JSONL)
- Update CLI to start host proxy instead of credential service

### Phase 2: Approvals via Relay
REQ-007

- Implement `osascript` dialog handler (`approvals/dialog.ts`)
- Update approval hook to send `approval_request` over relay
- Implement approval handler in host proxy (`approvals/handler.ts`)
- Remove SQLite-based approval polling

### Phase 3: Host MCP Servers
REQ-010, REQ-011, REQ-012

- Add `location` field to `appConfigSchema` and `ResolvedApp`
- Implement host MCP server lifecycle in host proxy
- Implement `mcp_tools_register` / `mcp_tools_registered` protocol
- Implement `mcp_tool_call` / `mcp_tool_result` forwarding
- Add dynamic route registration to `ToolRouter`
- Update CLI to partition apps by location

### Phase 4: Polish
REQ-013, REQ-014, REQ-015

- Relay connection resilience (reconnect with backoff)
- Host MCP server resource/prompt passthrough
- Audit persistence improvements
