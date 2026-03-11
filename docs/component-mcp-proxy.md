---
title: MCP Proxy
description: The security enforcement layer between agents and tools
---

# MCP Proxy

The **MCP Proxy** (`@clawmasons/proxy`) sits between agents and their upstream MCP servers (apps). It enforces role-based tool filtering, relays credential requests, and logs all operations for audit.

## What It Does

1. **Filters tools by role** — Only tools in the role's allow list are exposed to the agent
2. **Prefixes tool names** — Prevents collisions when multiple apps expose similarly-named tools
3. **Relays credentials** — Bridges agent credential requests to the credential service
4. **Audits operations** — Logs every tool call, credential access, and resource request to SQLite
5. **Manages sessions** — Tracks agent connections with risk-based session limits

## Tool Routing

### Prefixing

When the proxy connects to upstream apps, it prefixes each tool name with a short app identifier:

| App Package | Tool | Agent Sees |
|-------------|------|-----------|
| `@acme/app-github` | `create_pr` | `github_create_pr` |
| `@acme/app-filesystem` | `read_file` | `filesystem_read_file` |

When the agent calls a tool, the proxy unprefixes it and routes to the correct upstream app.

### Permission Filtering

The proxy reads the active role's `permissions` field and builds an allow list:

- Tools in the role's `allow` array for an app are exposed
- Tools in the `deny` array are blocked (even if in `allow`)
- Apps not listed in permissions are completely hidden
- The agent never sees tools it can't use

## Session Management

### Connection Flow

1. Agent posts to `/connect-agent` with a bearer token (`MCP_PROXY_TOKEN`)
2. Proxy validates the token and creates a session
3. Returns `{ sessionToken, sessionId }` for subsequent requests
4. The `sessionToken` is required for credential requests

### Risk-Based Limits

The proxy enforces connection limits based on the role's risk level:
- `LOW` risk — Standard connection limits
- `MEDIUM` risk — Reduced concurrent connections
- `HIGH` risk — Minimal concurrent connections

## Credential Relay

The proxy includes a `credential_request` tool that agents call to obtain secrets:

1. Agent calls `credential_request(key, sessionToken)`
2. Proxy validates the session token
3. Proxy forwards the request to the credential service via WebSocket
4. Credential service resolves the value and returns it
5. Proxy relays the value back to the agent
6. The entire exchange is audit-logged

See [Credential Service](component-credential-service.md) for resolution details.

## Audit Logging

All operations are logged to a SQLite database (`chapter.db`):

- **Tool calls** — Tool name, arguments, result, duration, status, timestamp
- **Credential requests** — Key, outcome (granted/denied/error), source, timestamp
- **Resource access** — Resource URI, operation, timestamp

Hooks fire at two points:
- **Pre-hook** — Before tool execution (generates audit ID, logs intent)
- **Post-hook** — After tool execution (logs result, duration, status)

## Transport Support

The proxy supports two MCP transport protocols:

| Transport | Endpoints | Use Case |
|-----------|-----------|----------|
| **SSE** | `GET /sse`, `POST /messages` | Default for Docker mode |
| **Streamable HTTP** | `POST /mcp`, `GET /mcp`, `DELETE /mcp` | Alternative transport |

Additionally:
- `POST /connect-agent` — Agent authentication
- `GET /health` — Health check (no auth required)

## Related

- [Architecture](architecture.mdx) — How the proxy fits in the runtime
- [Role](chapter-role.md) — How permissions are defined
- [Credential Service](component-credential-service.md) — The other side of credential relay
- [Security](security.md) — Full security model
