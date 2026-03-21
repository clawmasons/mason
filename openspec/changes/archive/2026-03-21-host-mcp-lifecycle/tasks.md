## Tasks: Host MCP Server Lifecycle — Start, Discover, Register

### Task 1: Add `addRoutes()` to `ToolRouter`

**File:** `packages/proxy/src/router.ts`

- [x] Add optional `isHostRoute?: boolean` to `RouteEntry` interface
- [x] Implement `addRoutes(appName: string, tools: Tool[]): void` method
  - Derives `appShortName` via `getAppShortName(appName)`
  - Creates `RouteEntry` for each tool with `isHostRoute: true`
  - Prefixes tool names with `ToolRouter.prefixName()`
  - Throws on duplicate prefixed names
  - Adds entries to internal `routes` map

### Task 2: Add `addRoutes()` tests to router.test.ts

**File:** `packages/proxy/tests/router.test.ts`

- [x] Test: `addRoutes()` adds tools dynamically to listTools()
- [x] Test: `addRoutes()` marks entries with `isHostRoute: true`
- [x] Test: `addRoutes()` throws on duplicate prefixed tool names
- [x] Test: `addRoutes()` with empty tools array is a no-op
- [x] Test: `resolve()` returns dynamically added routes
- [x] Test: coexists with constructor-built routes

### Task 3: Extend `HostProxy` for host MCP server lifecycle

**File:** `packages/proxy/src/host-proxy.ts`

- [x] Add `hostApps?: ResolvedApp[]` to `HostProxyConfig`
- [x] Add private `hostClients: Map<string, Client>` field
- [x] In `start()`, before relay connect:
  - For each host app, call `createTransport()` to create transport
  - Create `Client` from `@modelcontextprotocol/sdk`, connect to transport
  - Call `client.listTools()` to discover tools
  - Store client and discovered tools
- [x] In `start()`, after relay connect:
  - For each host app with discovered tools, send `mcp_tools_register` via `relayClient.request()`
  - Await `mcp_tools_registered` confirmation
- [x] In `stop()`:
  - Close all host MCP clients
  - Clear `hostClients` map
- [x] Error handling: log and skip apps that fail to start

### Task 4: Register `mcp_tools_register` handler on RelayServer

**File:** `packages/proxy/src/server.ts`

- [x] In `ProxyServer` constructor (where `relayServer` is created):
  - Register `mcp_tools_register` handler on the relay server
  - Handler parses tool definitions from message
  - Handler calls `router.addRoutes(app_name, tools)`
  - Handler sends `mcp_tools_registered` confirmation with same `id`

### Task 5: Create lifecycle integration test

**File:** `packages/proxy/tests/host-mcp/lifecycle.test.ts`

- [x] Mock `createTransport` and `Client` from MCP SDK (using `vi.hoisted()`)
- [x] Test: Host proxy starts host apps, discovers tools, registers via relay
- [x] Test: Multiple host apps handled correctly
- [x] Test: Start with no host apps works normally
- [x] Test: Stop closes host MCP clients
- [x] Test: MCP server start failure is handled gracefully (skips failed app)
- [x] Test: Apps with no tools discovered are skipped
- [x] Test: Tool descriptions and input schemas preserved during registration

### Task 6: Verify compilation and tests

- [x] Run `npx tsc --noEmit` — compiles (only pre-existing cli test error)
- [x] Run `npx vitest run packages/proxy/tests/` — 22 files, 364 tests pass
- [x] Run `npx vitest run packages/shared/tests/` — 10 files, 211 tests pass
