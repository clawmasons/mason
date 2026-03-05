## 1. ForgeProxyServer Core Class

- [x] 1.1 Create `src/proxy/server.ts` with `ForgeProxyServer` class skeleton: constructor accepting `{ port, transport, router, upstream }`, `start()`, and `stop()` methods
- [x] 1.2 Implement `start()` — create `node:http` server, set up transport-specific request routing (SSE or streamable-http), begin listening on configured port
- [x] 1.3 Implement `stop()` — close HTTP server, close active transports, clean up state

## 2. MCP Server & Tool Handlers

- [x] 2.1 Create MCP `Server` instance with `name: "forge"`, `version: "0.1.0"`, and `tools` capability
- [x] 2.2 Register `tools/list` handler — delegate to `router.listTools()` and return the tool array
- [x] 2.3 Register `tools/call` handler — resolve via `router.resolve(name)`, forward to `upstream.callTool()`, return result. Return `isError: true` for unknown tools or upstream failures

## 3. Transport Wiring

- [x] 3.1 Implement SSE transport path — handle `GET /sse` (create `SSEServerTransport`, connect `Server`, start stream) and `POST /messages` (forward to transport)
- [x] 3.2 Implement streamable-http transport path — create `StreamableHTTPServerTransport`, route requests through `handleRequest()`

## 4. Tests

- [x] 4.1 Create `tests/proxy/server.test.ts` with mocked `ToolRouter` and `UpstreamManager`
- [x] 4.2 Test `tools/list` returns prefixed tools from router
- [x] 4.3 Test `tools/call` with valid tool — resolves and forwards to upstream
- [x] 4.4 Test `tools/call` with unknown tool — returns `isError: true`
- [x] 4.5 Test `tools/call` when upstream throws — returns `isError: true` with error message
- [x] 4.6 Test `start()` and `stop()` lifecycle — server listens and shuts down cleanly
- [x] 4.7 Test custom port configuration
