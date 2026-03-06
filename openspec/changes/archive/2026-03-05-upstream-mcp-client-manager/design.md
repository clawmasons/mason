## Architecture

One new module: `src/proxy/upstream.ts`. No changes to existing modules.

### Class: UpstreamManager

A class that manages one MCP `Client` per app. Uses the `@modelcontextprotocol/sdk` client APIs to connect to upstream MCP servers via stdio or remote (SSE/streamable-http) transports.

### Transport Selection

Based on `ResolvedApp.transport`:
- `"stdio"` → `StdioClientTransport` — spawns a child process using `app.command` and `app.args`
- `"sse"` → `SSEClientTransport` — connects to `app.url` via Server-Sent Events
- `"streamable-http"` → `StreamableHTTPClientTransport` — connects to `app.url` via streamable HTTP

### Constructor Input

```typescript
interface UpstreamAppConfig {
  name: string;           // Full package name (e.g., "@clawmasons/app-github")
  app: ResolvedApp;       // From resolver/types.ts
  env?: Record<string, string>;  // Resolved environment variables (credentials)
}
```

The constructor takes an array of `UpstreamAppConfig` objects. No connections are made until `initialize()` is called.

### API Surface

```typescript
class UpstreamManager {
  constructor(apps: UpstreamAppConfig[]);

  // Connect all clients in parallel, throw if any fails within timeout
  initialize(timeoutMs?: number): Promise<void>;

  // List capabilities per app
  getTools(appName: string): Promise<Tool[]>;
  getResources(appName: string): Promise<Resource[]>;
  getPrompts(appName: string): Promise<Prompt[]>;

  // Forward operations to upstream
  callTool(appName: string, toolName: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  readResource(appName: string, uri: string): Promise<ReadResourceResult>;
  getPrompt(appName: string, name: string, args?: Record<string, string>): Promise<GetPromptResult>;

  // Close all connections
  shutdown(): Promise<void>;
}
```

### Initialization

`initialize(timeoutMs = 30000)`:
1. For each app, create a transport based on `app.transport`
2. Create an MCP `Client` with `{ name: "forge-upstream", version: "0.1.0" }`
3. Call `client.connect(transport)` for each
4. Wrap all connections in `Promise.all()` with a timeout via `Promise.race()`
5. If any connection fails or times out, throw with descriptive error naming the failed server
6. Store connected clients in a `Map<string, Client>`

### Error Handling

- Unknown app name in any method → throw `Error("Unknown app: <name>")`
- Connection timeout → throw `Error("Upstream initialization timed out after <ms>ms. Failed: <names>")`
- Individual connection failure → throw with upstream error details

### Pagination

The MCP SDK list methods support pagination via `cursor`/`nextCursor`. The manager handles pagination internally, collecting all pages before returning results.

### Shutdown

`shutdown()` calls `client.close()` on all connected clients. Errors during shutdown are caught and logged but don't throw.

## Decisions

1. **Class over functions**: Unlike `db.ts` which uses stateless functions, `UpstreamManager` is a class because it manages stateful connections (MCP clients). The class encapsulates the client lifecycle.
2. **Lazy initialization**: Constructor stores config only. `initialize()` must be called explicitly. This separates construction from async connection logic and lets callers control timing.
3. **Parallel initialization**: All upstream clients connect simultaneously via `Promise.all()`. This minimizes startup time when multiple apps are configured.
4. **Timeout via Promise.race**: A simple `setTimeout` + `Promise.race` pattern handles the startup timeout. No external timeout library needed.
5. **Pagination handled internally**: Callers get the full list of tools/resources/prompts without worrying about cursors. The manager pages through all results internally.
6. **Environment merging for stdio**: For stdio transports, the resolved `env` from `UpstreamAppConfig` is passed to `StdioClientTransport`. This includes credentials loaded from `.env` files.
