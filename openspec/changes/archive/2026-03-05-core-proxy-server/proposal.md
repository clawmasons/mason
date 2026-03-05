## Why

The forge proxy system has its upstream client management (`UpstreamManager`) and tool routing/filtering (`ToolRouter`) built, but there is no downstream-facing MCP server to expose these capabilities to agent runtimes. Without this server, runtimes cannot connect to forge and use the aggregated, prefixed, role-filtered tools. This is the missing piece that produces a **running proxy** — the first time an MCP client can actually connect and call tools through forge.

## What Changes

- New `ForgeProxyServer` class in `src/proxy/server.ts` that creates an MCP server named `"forge"` using `@modelcontextprotocol/sdk`
- Supports both SSE and streamable-http transports via a built-in HTTP server
- Registers `tools/list` handler that delegates to `ToolRouter.listTools()`
- Registers `tools/call` handler that resolves via `ToolRouter.resolve()` and forwards to `UpstreamManager.callTool()`
- Returns structured MCP errors for unknown/filtered tool calls
- Graceful startup (listen on configurable port) and shutdown (close HTTP server + transports)

## Capabilities

### New Capabilities
- `proxy-server`: The downstream-facing MCP server that wires together upstream clients and the tool router, serving `tools/list` and `tools/call` over SSE or streamable-http

### Modified Capabilities
_(none)_

## Impact

- **New file:** `src/proxy/server.ts`
- **New test:** `tests/proxy/server.test.ts`
- **Dependencies:** `@modelcontextprotocol/sdk` (already installed — server APIs), `node:http` (built-in)
- **Depends on:** `UpstreamManager` from `src/proxy/upstream.ts`, `ToolRouter` from `src/proxy/router.ts`
- **No breaking changes** — this is a new module with no modifications to existing code
