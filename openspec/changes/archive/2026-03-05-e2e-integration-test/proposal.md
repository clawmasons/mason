## Why

The forge proxy has been fully implemented (upstream manager, tool router, audit logging, approval workflow, resource/prompt passthrough, CLI command, Docker pipeline) but there is no comprehensive end-to-end test that exercises the **native forge proxy** (as opposed to the old tbxark/mcp-proxy). The existing `tests/integration/mcp-proxy.sh` tests the old external proxy binary via Docker — it doesn't test audit logging, approval workflows, or the native `forge proxy` startup sequence. CHANGE 10 in the forge-proxy IMPLEMENTATION plan calls for replacing this with a comprehensive integration test of the native proxy.

## What Changes

- New file: `tests/integration/forge-proxy.test.ts` — a Vitest integration test that exercises the full proxy lifecycle without Docker
- The test starts the proxy programmatically (not via Docker) using the same components as `forge proxy` CLI: `UpstreamManager`, `ToolRouter`, `ForgeProxyServer`, SQLite database, audit hooks, and approval hooks
- Uses the example workspace's `@example/app-filesystem` as a real upstream MCP server (stdio transport)
- Replaces the old `tests/integration/mcp-proxy.sh` shell script

## Capabilities

### New Capabilities
- `e2e-integration-test`: End-to-end integration test that validates the full native forge proxy lifecycle — startup, tool listing with prefixed/filtered names, tool call forwarding, audit log verification, approval workflow with auto-timeout, and clean shutdown

### Modified Capabilities
- `mcp-proxy-integration-test`: Updated spec to reflect the new native proxy test (replacing old external proxy test)

## Impact

- **New file:** `tests/integration/forge-proxy.test.ts`
- **Deprecated:** `tests/integration/mcp-proxy.sh` (replaced by the new Vitest test)
- **Dependencies:** Uses existing `@modelcontextprotocol/sdk` client APIs, `better-sqlite3`, `vitest`
- **No changes to source code** — this is a test-only change
- **Test scenarios:**
  1. `forge proxy` starts and accepts MCP connections
  2. `tools/list` returns prefixed, filtered tools only
  3. `tools/call` with valid tool returns correct result
  4. `tools/call` with unknown/filtered tool returns error + audit log shows "denied"
  5. Audit log populated with correct fields after tool calls
  6. Approval-required tool creates pending request, auto-denies after TTL
  7. Proxy shuts down cleanly
