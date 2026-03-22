## Tasks: Host MCP Server Tool Call Routing

### Implementation

- [x] 1. Modify `packages/proxy/src/server.ts` — Add `hostToolCallTimeoutMs` to `ProxyServerConfig` (default 60000)
- [x] 2. Modify `packages/proxy/src/server.ts` — In `CallToolRequestSchema` handler, detect `route.isHostRoute` and use `relay.request(mcp_tool_call)` instead of `upstream.callTool()`
- [x] 3. Modify `packages/proxy/src/host-proxy.ts` — Register `mcp_tool_call` handler on relay client that forwards to local MCP client and returns `mcp_tool_result`
- [x] 4. Modify `packages/cli/src/cli/commands/run-agent.ts` — Update `defaultStartHostProxy()` and `RunAgentDeps.startHostProxyFn` to accept `hostApps`
- [x] 5. Modify `packages/cli/src/cli/commands/run-agent.ts` — Partition apps by `location` in interactive and dev-container modes, pass `hostApps` to host proxy

### Tests

- [x] 6. New `packages/proxy/tests/host-mcp/routing.test.ts` — Tool call forwarding, timeout, error handling, relay disconnected
- [x] 7. Extend `packages/proxy/tests/host-mcp/lifecycle.test.ts` — End-to-end tool call flow

### Verification

- [x] 8. `npx tsc --noEmit` compiles
- [x] 9. `npx vitest run packages/proxy/tests/` passes
- [x] 10. `npx vitest run packages/cli/tests/` passes
