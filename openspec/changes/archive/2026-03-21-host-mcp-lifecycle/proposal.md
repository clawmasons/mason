## Why

The host proxy orchestrator (Change 8) handles credentials, approvals, and audit events over the relay, but has no support for host-side MCP servers. Some MCP servers (Xcode simulator tools, native GUI automation, hardware-dependent tools) cannot run inside Docker and must run on the host machine. Without this change, role authors cannot declare MCP servers with `location: "host"` and have them work.

This change extends the `HostProxy` to start MCP servers declared with `location: "host"`, discover their tools via `tools/list`, and register them with the Docker proxy over the relay using the `mcp_tools_register` / `mcp_tools_registered` protocol. On the Docker side, the `RelayServer` handles incoming `mcp_tools_register` messages by dynamically adding stub routes to the `ToolRouter`. This enables `tools/list` on the Docker proxy to include host-side tools alongside proxy-side tools.

Tool call forwarding (the actual execution of host tools) is deferred to Change 12.

## What Changes

- **Modify `packages/proxy/src/host-proxy.ts`** — Accept `hostApps: ResolvedApp[]` in `HostProxyConfig`. On `start()`, for each host app: spawn the MCP server via `StdioClientTransport` + `Client`, discover tools via `tools/list`, send `mcp_tools_register` over relay, and await `mcp_tools_registered` confirmation.

- **Modify `packages/proxy/src/router.ts`** — Add `addRoutes(appName: string, tools: Tool[])` method to `ToolRouter` for dynamic host tool registration. The method creates `RouteEntry` entries with a `isHostRoute: true` flag to distinguish them from upstream routes.

- **Modify `packages/proxy/src/relay/server.ts`** — Register a handler for `mcp_tools_register` messages. On receipt, call `ToolRouter.addRoutes()` to create stub route entries, then send back `mcp_tools_registered` confirmation.

- **Modify `packages/proxy/src/server.ts`** — Ensure `tools/list` includes dynamically registered host tools (already works via `router.listTools()` since `addRoutes()` adds to the same routes map).

- **New `packages/proxy/tests/host-mcp/lifecycle.test.ts`** — Test host MCP server lifecycle: mock MCP server, tool discovery, relay registration, confirmation.

- **Modify `packages/proxy/tests/router.test.ts`** — Test `addRoutes()` dynamic registration.

## Capabilities

### New Capabilities
- `host-mcp-lifecycle`: Host proxy starts host MCP servers, discovers tools, registers with Docker proxy via relay.
- `dynamic-tool-registration`: `ToolRouter.addRoutes()` supports adding tools at runtime.

### Modified Capabilities
- `host-proxy`: Extended to accept and manage host MCP server apps.
- `relay-server`: Handles `mcp_tools_register` messages and sends `mcp_tools_registered` confirmations.
- `tool-router`: Supports dynamic route addition via `addRoutes()`.

## Impact

- **Non-breaking** — `HostProxyConfig.hostApps` is optional. Existing host proxy usage without host apps continues to work unchanged.
- **`RouteEntry` extended** — New optional `isHostRoute` boolean flag. Existing route entries default to `false`.
- **No existing tests broken** — all changes are additive.
- Change 12 will use the `isHostRoute` flag to forward tool calls over the relay instead of to upstream.

## Dependencies

- Change 8 (Host Proxy Orchestrator) — `HostProxy` class exists.
- Change 10 (Host MCP Server Schema) — `ResolvedApp` has `location` field.
- Change 1 (Relay Message Protocol) — `mcp_tools_register` and `mcp_tools_registered` message types exist.
- Change 2 (Relay Server) — `RelayServer` exists with handler dispatch.
- Change 3 (Relay Client) — `RelayClient.request()` for correlated request/response.

## Test Coverage

- `packages/proxy/tests/host-mcp/lifecycle.test.ts`:
  - Host proxy starts mock MCP server and discovers tools.
  - Host proxy sends `mcp_tools_register` over relay.
  - Docker proxy receives registration and creates stub routes.
  - `mcp_tools_registered` confirmation is sent back.
  - `tools/list` includes host tools with correct prefixing.
  - Host proxy shuts down MCP servers on stop().
  - Error handling: MCP server start failure, relay not connected.
- `packages/proxy/tests/router.test.ts`:
  - `addRoutes()` adds tools dynamically.
  - `addRoutes()` marks entries with `isHostRoute: true`.
  - `addRoutes()` throws on duplicate prefixed tool names.
  - `listTools()` includes dynamically added tools.
  - `resolve()` returns dynamically added routes.
