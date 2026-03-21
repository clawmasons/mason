## Design: Host MCP Server Lifecycle — Start, Discover, Register

### Overview

This design details how the `HostProxy` starts host-side MCP servers, discovers their tools, and registers them with the Docker proxy over the relay. The implementation touches four files and adds one new test file.

### Data Flow

```
HostProxy.start()
  |
  |-- For each hostApp (location: "host"):
  |     |
  |     |-- 1. Create StdioClientTransport (reuse createTransport from upstream.ts)
  |     |-- 2. Create MCP Client, connect to transport
  |     |-- 3. Call client.listTools() to discover tools
  |     |-- 4. Send mcp_tools_register message via relay
  |     |-- 5. Await mcp_tools_registered confirmation
  |     |-- 6. Store client reference for later tool calls (Change 12) and cleanup
  |
  |-- Continue with existing credential/approval/audit handler wiring
  |-- Connect relay client

Docker RelayServer (on mcp_tools_register received):
  |
  |-- Parse tool definitions from message
  |-- Call toolRouter.addRoutes(app_name, tools) to create stub entries
  |-- Send mcp_tools_registered confirmation back
```

### Interface Changes

#### `HostProxyConfig` (host-proxy.ts)

```typescript
export interface HostProxyConfig {
  // ... existing fields ...
  /** Host-side MCP server apps to start and manage. */
  hostApps?: ResolvedApp[];
}
```

#### `RouteEntry` (router.ts)

```typescript
export interface RouteEntry {
  // ... existing fields ...
  /** True if this route is for a host MCP server tool (forwarded via relay). */
  isHostRoute?: boolean;
}
```

#### `ToolRouter.addRoutes()` (router.ts)

```typescript
/**
 * Dynamically add routes for host MCP server tools.
 * Called when the relay server receives mcp_tools_register.
 *
 * @param appName - The app name (used as-is for short name derivation)
 * @param tools - Tool definitions from the host MCP server
 * @throws If any prefixed tool name collides with an existing route
 */
addRoutes(appName: string, tools: Tool[]): void
```

The method:
1. Derives `appShortName` from `appName` using `getAppShortName()`.
2. For each tool, creates a `RouteEntry` with `isHostRoute: true`.
3. Prefixes tool names using `ToolRouter.prefixName()`.
4. Throws on duplicate prefixed names (same as constructor behavior).
5. Adds entries to the internal `routes` map.

#### Host MCP Server Management in `HostProxy`

```typescript
// Private field to track started MCP clients
private hostClients = new Map<string, Client>();
```

On `start()`:
- Before connecting the relay, iterate `hostApps`.
- For each app, use `createTransport()` from `upstream.ts` to create a `StdioClientTransport`.
- Create a `Client` from `@modelcontextprotocol/sdk`, connect to the transport.
- Call `client.listTools()` to discover available tools.
- After relay is connected, send `mcp_tools_register` via `relayClient.request()`.
- Store the client in `hostClients` for later use (Change 12 will use these for tool call forwarding).

On `stop()`:
- Close all host MCP clients (call `client.close()`).
- Clear the `hostClients` map.

#### RelayServer Registration Handler

The `RelayServer` will not hardcode the `mcp_tools_register` handler. Instead, the `ProxyServer` (or whoever sets up the relay server) registers the handler externally. This keeps `RelayServer` generic.

The handler registration happens in `ProxyServer` or via a new method on `ProxyServer`:

```typescript
// In ProxyServer constructor or start(), if relayServer exists:
relayServer.registerHandler("mcp_tools_register", (msg) => {
  const regMsg = msg as McpToolsRegisterMessage;
  const tools: Tool[] = regMsg.tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Tool["inputSchema"],
  }));
  this.config.router.addRoutes(regMsg.app_name, tools);
  relayServer.send(createRelayMessage("mcp_tools_registered", {
    app_name: regMsg.app_name,
  }));
});
```

Wait -- this has a subtlety. The `mcp_tools_registered` response must use the same `id` as the incoming `mcp_tools_register` request, because the host proxy uses `request()` (correlated by id) to await the confirmation. So the handler must construct the response with the same `id`:

```typescript
relayServer.registerHandler("mcp_tools_register", (msg) => {
  const regMsg = msg as McpToolsRegisterMessage;
  const tools: Tool[] = regMsg.tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema as Tool["inputSchema"],
  }));
  this.config.router.addRoutes(regMsg.app_name, tools);

  // Send confirmation with same id for request/response correlation
  const confirmation: McpToolsRegisteredMessage = {
    id: regMsg.id,
    type: "mcp_tools_registered",
    app_name: regMsg.app_name,
  };
  relayServer.send(confirmation);
});
```

### Host MCP Server Startup Sequence

The host proxy needs to start MCP servers and discover tools BEFORE connecting the relay, but it needs the relay to register tools. The sequence is:

1. Start all host MCP servers (spawn processes, connect clients, discover tools).
2. Store discovered tools per app in a local map.
3. Connect the relay client.
4. For each app, send `mcp_tools_register` and await confirmation.

This way, if any MCP server fails to start, we fail fast before connecting the relay.

### Error Handling

- **MCP server start failure**: Log error, skip the app, continue with remaining apps. Do not fail the entire host proxy start.
- **Tool discovery failure**: Same as start failure — log and skip.
- **Registration timeout**: `relayClient.request()` will reject after timeout. Log error but do not fail — the tools simply won't be available.
- **Relay not connected during registration**: This shouldn't happen since we connect relay before registering. If it does, `relayClient.request()` throws immediately.

### Test Coverage

#### `packages/proxy/tests/host-mcp/lifecycle.test.ts`

Tests use a mock MCP server (a simple stdio script that responds to `initialize` and `tools/list`). Alternatively, we can mock the `Client` class at the module level.

Approach: Mock `createTransport` and `Client` to avoid spawning real processes.

Test cases:
1. **Start with host apps discovers tools and registers via relay** — mock Client.listTools() to return tools, verify mcp_tools_register sent over relay, verify mcp_tools_registered received.
2. **tools/list includes host tools** — after registration, verify ToolRouter includes the host tools.
3. **Stop closes host MCP clients** — verify Client.close() called for each host client.
4. **Start with no host apps is a no-op** — existing behavior unchanged.
5. **MCP server start failure is handled gracefully** — mock Client.connect() to throw, verify other apps still start.
6. **Registration with correlated response** — verify the mcp_tools_registered has the same id.

#### `packages/proxy/tests/router.test.ts` additions

1. **addRoutes adds tools dynamically** — call addRoutes, verify listTools includes new tools.
2. **addRoutes marks entries with isHostRoute: true** — verify resolve() returns entry with isHostRoute.
3. **addRoutes throws on duplicate prefixed tool names** — attempt to add a tool that collides.
4. **addRoutes works with empty tools array** — no-op, no error.
5. **resolve returns dynamically added routes** — verify resolve() finds the new entry.
