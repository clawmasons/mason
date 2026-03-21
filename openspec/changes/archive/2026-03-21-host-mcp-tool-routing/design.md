## Design: Host MCP Server Tool Call Routing

### Overview

This change connects the stub routes created in Change 11 to actual tool execution. The flow is:

```
Agent -> Docker Proxy (CallToolRequestSchema handler)
  -> resolve route -> isHostRoute?
    -> YES: relay.request(mcp_tool_call) -> Host Proxy
              -> hostClients.get(app_name).callTool() -> MCP Server
              <- mcp_tool_result <- relay
    -> NO:  upstream.callTool() (existing path, unchanged)
```

### Docker Side: server.ts Changes

In the `CallToolRequestSchema` handler, after resolving the route and passing approval checks, add a branch:

```typescript
if (route.isHostRoute) {
  // Forward to host proxy via relay
  if (!relay || !relay.isConnected()) {
    // error: relay not connected
  }
  const mcpToolCallMsg = createRelayMessage("mcp_tool_call", {
    app_name: route.appName,
    tool_name: route.originalToolName,
    arguments: args as Record<string, unknown> | undefined,
  });
  const response = await relay.request(mcpToolCallMsg, hostToolCallTimeoutMs);
  // Extract result from mcp_tool_result response
} else {
  // Existing upstream.callTool() path
}
```

A new config field `hostToolCallTimeoutMs` (default: 60000) controls the relay request timeout for host tool calls, separate from `credentialRequestTimeoutMs`.

### Host Side: host-proxy.ts Changes

Register an `mcp_tool_call` handler on the relay client during `start()`:

```typescript
this.relayClient.registerHandler("mcp_tool_call", async (msg) => {
  const toolCall = msg as McpToolCallMessage;
  const client = this.hostClients.get(toolCall.app_name);

  if (!client) {
    // Send error response
    this.relayClient.send({ id: msg.id, type: "mcp_tool_result", error: "..." });
    return;
  }

  try {
    const result = await client.callTool({ name: toolCall.tool_name, arguments: toolCall.arguments });
    this.relayClient.send({ id: msg.id, type: "mcp_tool_result", result });
  } catch (err) {
    this.relayClient.send({ id: msg.id, type: "mcp_tool_result", error: err.message });
  }
});
```

Key design decisions:
- The response uses the same `id` as the request for correlation (the relay server's `request()` method matches by id).
- The handler is async but the `registerHandler` API expects sync. We handle this by sending the response inside the async callback — the relay dispatches the message and moves on; the handler does async work and sends a response when done.

### CLI: run-agent.ts Changes

Update `defaultStartHostProxy()` signature:
```typescript
async function defaultStartHostProxy(opts: {
  proxyPort: number;
  relayToken: string;
  envCredentials: Record<string, string>;
  hostApps?: ResolvedApp[];
}): Promise<{ stop: () => Promise<void> }>
```

In each mode function, after resolving the agent, partition apps:
```typescript
const proxyApps = resolvedAgent.apps.filter(a => a.location !== "host");
const hostApps = resolvedAgent.apps.filter(a => a.location === "host");
```

Pass `hostApps` to `startHostProxy()`. The `proxyApps` are already what goes into Docker compose (the existing code already only composes proxy-location apps since host apps wouldn't have Docker entries).

Update `RunAgentDeps.startHostProxyFn` type to include `hostApps?`.

### Error Handling

1. **Relay not connected**: Return `isError: true` text response to agent.
2. **Timeout**: The `relay.request()` timeout rejects the promise; caught and returned as error.
3. **Unknown app_name**: Host proxy sends `mcp_tool_result` with `error` field.
4. **MCP client error**: Host proxy catches and sends `mcp_tool_result` with `error` field.
5. **Non-host tools**: Completely unaffected — existing `upstream.callTool()` path.

### Audit Integration

Host tool calls go through the same audit pre/post hooks as upstream tool calls. The `auditPreHook` is called before the relay request, and `auditPostHook` after. This is already handled by the existing code structure — we just need to use it in the host route branch.

### Test Coverage

1. **`packages/proxy/tests/host-mcp/routing.test.ts`** (new):
   - Tool call forwarded over relay to host proxy, result returned
   - Timeout produces error response
   - Relay not connected produces error response
   - Error from host MCP server is propagated
   - Non-host tools route to upstream (unchanged)
   - Unknown app_name returns error

2. **`packages/proxy/tests/host-mcp/lifecycle.test.ts`** (extended):
   - End-to-end: start host MCP server -> register tools -> call tool -> get result

3. **`packages/cli/tests/`** (existing tests updated):
   - `startHostProxyFn` signature includes `hostApps`
   - App partitioning by location
