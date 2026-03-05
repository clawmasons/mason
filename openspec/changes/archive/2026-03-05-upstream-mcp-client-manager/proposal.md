## Why

The forge proxy (PRD: forge-proxy) needs to connect to upstream MCP servers — one per app in the agent's dependency graph. Every downstream tool call, resource read, and prompt get must be forwarded to the correct upstream server. Without a client manager, the proxy server (CHANGE 4) has no way to communicate with the apps it aggregates.

This is the second building block after the SQLite database module (CHANGE 1). The UpstreamManager establishes and manages MCP client connections so that subsequent changes (router, server, hooks) can forward requests upstream.

**PRD refs:** REQ-002 (Upstream MCP Client Management)

## What Changes

- **New file: `src/proxy/upstream.ts`** — UpstreamManager class that:
  - Takes a list of app configurations (name + ResolvedApp + optional env overrides)
  - Creates one MCP client per app (stdio: spawn process; remote: connect to URL)
  - Initializes all clients in parallel with a configurable timeout
  - Exposes `getTools()`, `getResources()`, `getPrompts()` per app
  - Forwards `callTool()`, `readResource()`, `getPrompt()` to the correct upstream
  - Graceful `shutdown()` to close all connections

- **New file: `tests/proxy/upstream.test.ts`** — Unit tests with mock transports

- **New dependency: `@modelcontextprotocol/sdk`** — Official MCP SDK for client APIs

## Capabilities

### New Capabilities
- `upstream-mcp-client`: Manages one MCP client connection per app, supporting stdio and remote transports, with parallel initialization, timeout handling, and forwarding of tool/resource/prompt operations

## Impact

- **New:** `src/proxy/upstream.ts` — upstream client manager
- **New:** `tests/proxy/upstream.test.ts` — upstream client tests
- **New dependency:** `@modelcontextprotocol/sdk`
- **No existing files modified**
