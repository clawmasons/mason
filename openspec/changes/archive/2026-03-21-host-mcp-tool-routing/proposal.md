## Why

Change 11 established the host MCP server lifecycle: the host proxy starts host MCP servers, discovers their tools, and registers stub routes with the Docker proxy via the relay. However, those stub routes are inert — when an agent calls a host tool, the Docker proxy has no logic to forward the call over the relay instead of to an upstream MCP client. The agent gets an error because there is no upstream client for host-registered tools.

This change completes the host MCP server story by wiring the tool call forwarding path. On the Docker side, the `CallToolRequestSchema` handler in `server.ts` detects `isHostRoute` on the resolved route and sends an `mcp_tool_call` message over the relay instead of calling `upstream.callTool()`. On the host side, the `HostProxy` registers a handler for `mcp_tool_call` that looks up the local MCP client by `app_name` and calls `client.callTool()`, then sends back an `mcp_tool_result`. A configurable timeout (default 60s) governs host tool calls.

Additionally, the CLI's `run-agent` command is updated to partition role apps by `location`, passing `hostApps` to the host proxy and only `proxyApps` to Docker compose configuration.

## What Changes

- **Modify `packages/proxy/src/server.ts`** — In the `CallToolRequestSchema` handler, after resolving a route, check `route.isHostRoute`. If true, send an `mcp_tool_call` message via `relay.request()` with a configurable timeout (default 60s) instead of calling `upstream.callTool()`. Extract the `CallToolResult` from the `mcp_tool_result` response.

- **Modify `packages/proxy/src/host-proxy.ts`** — Register an `mcp_tool_call` handler on the relay client. The handler looks up the MCP client by `app_name` in the `hostClients` map, calls `client.callTool()`, and sends back an `mcp_tool_result` with the result (or error).

- **Modify `packages/cli/src/cli/commands/run-agent.ts`** — Update `defaultStartHostProxy()` to accept `hostApps` parameter. In `runAgentInteractiveMode()` and `runAgentDevContainerMode()`, partition `resolvedAgent.apps` by `location` field and pass `hostApps` to `startHostProxy()`.

- **Modify `packages/proxy/src/server.ts`** — Add `hostToolCallTimeoutMs` to `ProxyServerConfig` (default 60000ms).

- **New `packages/proxy/tests/host-mcp/routing.test.ts`** — Test tool call forwarding over relay, response correlation, timeout handling, error propagation, non-host tools unaffected.

- **Modify `packages/proxy/tests/host-mcp/lifecycle.test.ts`** — Extend with end-to-end tool call flow test.

## Capabilities

### New Capabilities
- `host-mcp-tool-routing`: Agent tool calls for host MCP server tools are forwarded over the relay to the host proxy, executed locally, and results returned.

### Modified Capabilities
- `host-proxy`: Extended to handle `mcp_tool_call` messages by forwarding to local MCP clients.
- `proxy-server`: Extended to detect host routes and use relay instead of upstream for tool calls.
- `cli-host-proxy`: Updated to partition apps by location and pass `hostApps` to host proxy.

## Test Plan

1. **Tool call forwarding** — Agent calls a host tool -> Docker proxy sends `mcp_tool_call` over relay -> host proxy forwards to local MCP client -> result returns as `mcp_tool_result` -> agent receives result.
2. **Timeout handling** — Host tool call exceeds timeout -> agent receives error with timeout message.
3. **Error propagation** — Host MCP server returns error -> agent receives error.
4. **Non-host tools unaffected** — Non-host tools are routed to upstream as before.
5. **Unknown host app** — `mcp_tool_call` for an unknown app_name -> error response.
6. **Relay not connected** — Host tool call when relay is disconnected -> error response.
7. **CLI app partitioning** — Apps with `location: "host"` are passed to host proxy, others to Docker compose.
8. **End-to-end lifecycle** — Full flow from MCP server start -> tool registration -> tool call -> result.
