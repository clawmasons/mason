---
title: Proxy
description: Tool routing, credential relay, approvals, audit, and host MCP servers
---

# Proxy

The **Proxy** (`@clawmasons/proxy`) is mason's security enforcement layer. It runs as two components:

- **Docker-Side Proxy (ProxyServer)** — Runs inside Docker alongside the agent. Handles tool routing, session management, and relays credential/approval requests to the host.
- **Host-Side Proxy (HostProxy)** — Runs in-process on the host machine. Handles credential resolution, approval dialogs, audit persistence, and host MCP server lifecycle.

The two sides communicate over a single multiplexed WebSocket connection (the **relay protocol**).

## Docker-Side Proxy

### Tool Routing

When the proxy connects to upstream MCP apps, it prefixes each tool name with a short app identifier:

| App | Tool | Agent Sees |
|-----|------|-----------|
| `github` | `create_pr` | `github_create_pr` |
| `filesystem` | `read_file` | `filesystem_read_file` |

When the agent calls a tool, the proxy unprefixes it and routes to the correct upstream app.

### Permission Filtering

The proxy reads the active role's `permissions` and builds an allow list:

- Tools in the role's `allow` array are exposed
- Tools in the `deny` array are blocked (even if in `allow`)
- Apps not listed in permissions are completely hidden
- The agent never sees tools it can't use

### Session Management

1. Agent posts to `/connect-agent` with a bearer token (`MCP_PROXY_TOKEN`)
2. Proxy validates the token and creates a session
3. Returns `{ sessionToken, sessionId }` for subsequent requests
4. The `sessionToken` is required for credential requests

Risk levels (`LOW`, `MEDIUM`, `HIGH`) control concurrent session limits.

### Transport Support

| Transport | Endpoints | Use Case |
|-----------|-----------|----------|
| **SSE** | `GET /sse`, `POST /messages` | Default for Docker mode |
| **Streamable HTTP** | `POST /mcp`, `GET /mcp`, `DELETE /mcp` | Alternative transport |

Additionally:
- `POST /connect-agent` — Agent authentication
- `GET /health` — Health check (no auth required)

## Host-Side Proxy

The `HostProxy` class orchestrates all host-side services. It is purely a WebSocket client — it does not listen on any port.

On `start()`:
1. Initializes `CredentialService` with `CredentialResolver`
2. Creates `AuditWriter` for JSONL audit persistence
3. Starts host MCP servers (if any) and discovers their tools
4. Creates `RelayClient` and registers handlers for credential requests, approval requests, audit events, and host tool calls
5. Connects to the Docker proxy's `/ws/relay` endpoint
6. Registers host MCP server tools with the Docker proxy

On `stop()`: disconnects relay, closes host MCP clients, closes audit writer.

## Relay Protocol

The relay replaces the old single-purpose `/ws/credentials` WebSocket with a unified `/ws/relay` endpoint that multiplexes all Docker-to-host communication.

### Authentication

The host proxy connects with a bearer token (`RELAY_TOKEN`) in the WebSocket upgrade request. Invalid tokens are rejected with HTTP 401.

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `credential_request` | Docker → Host | Request a credential value |
| `credential_response` | Host → Docker | Return credential value or error |
| `approval_request` | Docker → Host | Request human approval for a tool call |
| `approval_response` | Host → Docker | Return approved/denied status |
| `mcp_tool_call` | Docker → Host | Forward a tool call to a host MCP server |
| `mcp_tool_result` | Host → Docker | Return host tool call result |
| `mcp_tools_register` | Host → Docker | Register host MCP server tools |
| `mcp_tools_registered` | Docker → Host | Confirm tool registration |
| `audit_event` | Docker → Host | Fire-and-forget audit log entry |

Every message has an `id` (UUIDv4) and a `type` discriminator. Request/response pairs are correlated by `id`.

### Reconnection

The `RelayClient` automatically reconnects with exponential backoff (500ms → 1s → 2s → ... → 8s cap, up to 10 attempts) on unexpected disconnects. The Docker proxy waits up to 10 seconds for relay reconnection before failing credential or tool requests.

## Credential Resolution

Credentials are resolved on the host machine and never stored in Docker environment variables or compose files.

### Flow

1. Agent calls `credential_request(key, sessionToken)` via the MCP proxy
2. Docker proxy validates the session and sends a `credential_request` relay message
3. Host proxy's `CredentialRelayHandler` calls `CredentialService.handleRequest()`
4. Service validates the key is declared in the role's `credentials` field
5. Resolver checks sources in priority order
6. Result returns as a `credential_response` relay message

### Resolution Priority

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Session overrides | Credentials from ACP session configuration |
| 2 | Environment variables | Host process environment |
| 3 | macOS Keychain | System keychain lookup |
| 4 | `.env` file | Project-level dotenv file |

The first source that provides a value wins.

## Approval Workflow

Roles can require human approval for sensitive operations using `constraints.requireApprovalFor` glob patterns.

### Flow

1. Agent calls a tool matching an approval pattern
2. Docker proxy sends an `approval_request` relay message with tool name, arguments, and TTL
3. Host proxy's `ApprovalHandler` shows a native macOS dialog (via `osascript`)
4. User clicks Approve or Deny
5. `approval_response` returns to the Docker proxy
6. Tool call proceeds or is blocked

If the TTL expires before the user responds, the call is auto-denied. On non-macOS platforms, calls are auto-approved with a warning log.

## Host MCP Servers

MCP servers can run on the host machine instead of inside Docker. This is useful for tools that need host hardware or GUI access (e.g., Xcode simulators, iOS devices).

### Configuration

Add `location: host` to an MCP server in your ROLE.md:

```yaml
mcp_servers:
  - name: xcode-sim
    location: host
    transport: stdio
    command: npx
    args: ["-y", "@example/xcode-mcp-server"]
```

### Lifecycle

1. Host proxy spawns the MCP server process using `StdioClientTransport`
2. Connects an MCP client and calls `tools/list` to discover tools
3. Sends `mcp_tools_register` relay message with tool definitions
4. Docker proxy creates stub routes in the `ToolRouter`
5. Agent sees host tools in `tools/list` (prefixed like any other app)

### Tool Call Routing

When the agent calls a host tool:
1. Docker proxy detects the host stub route
2. Sends `mcp_tool_call` relay message to the host proxy
3. Host proxy forwards to the local MCP client via `client.callTool()`
4. Result returns as `mcp_tool_result`

Host tool calls have a configurable timeout (default 60s).

## Audit Logging

All operations are logged to `~/.mason/data/audit.jsonl` on the host machine as JSON lines.

The Docker proxy sends `audit_event` relay messages (fire-and-forget) to the host proxy, which appends them via the `AuditWriter`.

Logged events include:
- **Tool calls** — tool name, arguments, result, duration, status
- **Credential requests** — key, outcome (granted/denied/error), source
- **Approval decisions** — tool name, decision, response time

## Token Authentication

| Token | Purpose | Scope |
|-------|---------|-------|
| `MCP_PROXY_TOKEN` | Agent-to-proxy authentication | Agent container → Docker proxy |
| `RELAY_TOKEN` | Host-to-proxy relay authentication | Host proxy → Docker proxy WebSocket |
| Session token | Credential request authentication | Returned by `/connect-agent` |

Tokens are generated per session and not reused.

## Related

- [Architecture](architecture.md) — How the proxy fits in the runtime
- [Role](role.md) — How permissions and approval patterns are defined
- [Security](security.md) — Full security model
