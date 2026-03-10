## Context

The proxy server (`@clawmasons/proxy`) currently handles MCP tool/resource/prompt routing between agents and upstream MCP servers. The credential service package (CHANGE 3) has a WebSocket client that expects to connect to the proxy's `/ws/credentials` endpoint. This change adds the proxy-side infrastructure to complete the credential pipeline.

The proxy already has auth token checking (`checkAuth`), audit logging, and approval workflows. The new credential infrastructure follows the same patterns but operates independently from upstream MCP tool routing.

## Goals / Non-Goals

**Goals:**
- `POST /connect-agent` endpoint that authenticates agents and issues session tokens
- `SessionStore` for tracking active agent sessions
- `GET /ws/credentials` WebSocket endpoint for the credential service
- `credential_request` internal MCP tool registered alongside upstream tools
- Request/response correlation over WebSocket using request IDs
- Timeout handling for credential requests

**Non-Goals:**
- Risk-based connection limits (CHANGE 5)
- Agent entry package (CHANGE 6)
- Credential resolution logic (that's in credential-service, CHANGE 2/3)

## Decisions

### Decision 1: SessionStore is a plain in-memory Map

**Choice**: `SessionStore` is a simple class wrapping `Map<string, SessionEntry>` with lookup-by-token support.

**Rationale**: Sessions are scoped to a single proxy instance lifetime. No persistence needed. The proxy runs one instance per agent-role pair. A Map with a secondary index (token → session_id) provides O(1) lookups.

### Decision 2: Credential relay uses pending request map with timeouts

**Choice**: The `CredentialRelay` class maintains a `Map<requestId, { resolve, reject, timer }>` for in-flight credential requests. When the proxy forwards a request to the credential service over WebSocket, it creates a pending entry. When a response comes back, it matches by `id` and resolves the promise.

**Rationale**: WebSocket is async — we need to correlate requests to responses. Using UUIDs as request IDs (matching the credential-service schema's `id` field) and a pending map with timeouts prevents leaked promises and hung requests.

### Decision 3: Only one credential service connection allowed

**Choice**: The `CredentialRelay` stores a single WebSocket reference. If a second credential service tries to connect, the previous one is closed.

**Rationale**: The PRD specifies one credential service per proxy instance. Allowing replacement (rather than rejection) supports reconnect scenarios where the old connection might be stale.

### Decision 4: credential_request tool is an internal tool not from upstream

**Choice**: The `credential_request` tool is added directly to the MCP server's tool list and call handler, separate from the `ToolRouter`. It's handled before the router resolution check.

**Rationale**: This tool is not an upstream MCP server tool — it's a proxy-native capability. The router should not need to know about it. The tool handler in `createMcpServer()` checks for `credential_request` first, then falls through to the router.

### Decision 5: WebSocket upgrade handled via the http server's upgrade event

**Choice**: Use the Node.js http server's `upgrade` event with the `ws` library's `WebSocketServer` in `noServer` mode.

**Rationale**: The proxy already uses `createServer` for HTTP. WebSocket upgrades share the same port. Using `noServer` mode gives us control over authentication before accepting the upgrade.

## Risks / Trade-offs

- [Risk] Credential request timeout too short/long → Default 30s, configurable. Most credential resolutions are sub-second.
- [Trade-off] In-memory session store means sessions are lost on proxy restart → Acceptable; proxy runs per-session in Docker. Agent-entry reconnects if needed.
