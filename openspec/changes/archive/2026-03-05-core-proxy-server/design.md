## Context

The forge proxy has three layers:
1. **Upstream** (`UpstreamManager` in `src/proxy/upstream.ts`): Manages MCP client connections to upstream app servers (stdio, SSE, streamable-http)
2. **Routing** (`ToolRouter` in `src/proxy/router.ts`): Prefixes tool names with app short names and filters by role permissions
3. **Database** (`src/proxy/db.ts`): SQLite for audit logging and approval workflows

The missing piece is the **downstream layer** — an MCP server that runtimes (Claude Code, Codex) connect to as their sole MCP endpoint. This server aggregates all upstream tools through the router and exposes them over a single SSE or streamable-http endpoint.

The MCP SDK (`@modelcontextprotocol/sdk` v1.27.1, already installed) provides both a high-level `McpServer` and low-level `Server` class, plus `SSEServerTransport` and `StreamableHTTPServerTransport`.

## Goals / Non-Goals

**Goals:**
- Create a `ForgeProxyServer` class that starts an MCP server named `"forge"` on a configurable port
- Handle `tools/list` by delegating to `ToolRouter.listTools()`
- Handle `tools/call` by resolving via `ToolRouter.resolve()` and forwarding to `UpstreamManager.callTool()`
- Support both SSE and streamable-http transports
- Graceful startup and shutdown

**Non-Goals:**
- Audit logging (CHANGE 5)
- Approval workflows (CHANGE 6)
- Resource/prompt passthrough (CHANGE 7)
- CLI command integration (CHANGE 8)
- Hook pipeline architecture — this change does direct wiring only

## Decisions

### D1: Use low-level `Server` over high-level `McpServer`

**Choice:** Use `Server` with `setRequestHandler()`.

**Rationale:** The `McpServer` high-level API registers individual tools with callbacks. Our use case is different — we have a dynamic set of tools from the router that changes based on upstream discovery. Using `Server.setRequestHandler(ListToolsRequestSchema, ...)` lets us return the full tool list from `router.listTools()` in a single handler. Similarly, `CallToolRequestSchema` gives us the raw `{name, arguments}` which we resolve through the router. The high-level API would require re-registering tools whenever upstreams change, adding unnecessary complexity.

**Alternative considered:** `McpServer.tool()` per tool — would require iterating over router entries and creating individual callbacks. More code, no benefit, and harder to test as a unit.

### D2: Built-in `node:http` server (not Express)

**Choice:** Use `node:http.createServer()` directly.

**Rationale:** The MCP SDK transports accept raw `IncomingMessage`/`ServerResponse` objects. Express adds unnecessary weight for what is essentially two routes (SSE endpoint + POST endpoint). The proxy server is not a general-purpose web server — it only handles MCP protocol messages.

### D3: Transport strategy — one transport per connection

**Choice:** For SSE transport, create a new `SSEServerTransport` per GET request and a new `Server` instance per connection. For streamable-http, use a single `StreamableHTTPServerTransport` per session.

**Rationale:** The MCP SDK's `SSEServerTransport` is per-connection (it takes the response object in its constructor). The `StreamableHTTPServerTransport` manages sessions internally. We follow the SDK's intended usage patterns.

### D4: Error handling for unknown tools

**Choice:** Return an MCP error result with `isError: true` and a descriptive text content when `router.resolve()` returns `null`.

**Rationale:** Per MCP spec, `tools/call` should return a `CallToolResult` with `isError: true` rather than throwing a JSON-RPC error. This lets the runtime display the error message to the agent without breaking the connection. Throwing would be appropriate for protocol-level errors, but "unknown tool" is an application-level error.

### D5: Server configuration via constructor options

**Choice:** `ForgeProxyServer` takes a config object: `{ port, transport, router, upstream }`.

**Rationale:** Constructor injection keeps the server testable — tests can pass mock router/upstream instances. The config pattern matches the PRD's `CHANGE 4` scope definition exactly.

## Risks / Trade-offs

- **Single-connection SSE limitation** → The initial implementation creates one `Server` + `SSEServerTransport` per connection. This is correct per the SDK but means each connection is independent. For v1 this is fine — each runtime gets its own connection. [Risk: connection management complexity] → Mitigation: keep it simple, one connection at a time for now.

- **No authentication on the MCP endpoint** → The proxy server is open on the configured port. [Risk: unauthorized access] → Mitigation: out of scope for this change. The `forge proxy` CLI command (CHANGE 8) will handle auth token generation. For now, the server is local-only.

- **Transport deprecation** → `SSEServerTransport` is marked deprecated in the SDK in favor of `StreamableHTTPServerTransport`. → Mitigation: support both, default to streamable-http. SSE support is needed for backward compatibility with runtimes that only support SSE.
