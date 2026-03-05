## 1. Test Infrastructure Setup

- [ ] 1.1 Create `tests/integration/forge-proxy.test.ts` with imports: `vitest`, MCP SDK client, `ForgeProxyServer`, `UpstreamManager`, `ToolRouter`, `openDatabase`, `queryAuditLog`, `updateApprovalStatus`
- [ ] 1.2 Set up `beforeAll`: create temp directory, create temp SQLite database file, configure `UpstreamManager` with `@modelcontextprotocol/server-filesystem` pointing at the temp dir, initialize upstream, fetch tool list, build `ToolRouter` with tool filter allowing all filesystem tools, start `ForgeProxyServer` on a test port
- [ ] 1.3 Set up `afterAll`: close MCP client, stop server, shutdown upstream manager, close database, remove temp directory and temp DB file

## 2. Core Proxy Lifecycle Tests

- [ ] 2.1 Test: proxy starts and accepts MCP connections — connect client, verify `initialize` succeeds
- [ ] 2.2 Test: `tools/list` returns prefixed, filtered tools — verify tool names are prefixed with `filesystem_` (e.g., `filesystem_read_file`, `filesystem_write_file`, `filesystem_list_directory`)
- [ ] 2.3 Test: `tools/call` with valid tool returns correct result — write a file via `filesystem_write_file`, read it back via `filesystem_read_file`, verify content matches
- [ ] 2.4 Test: `tools/call` with unknown/filtered tool returns error — call a non-existent tool, verify `isError: true`

## 3. Audit Logging Tests

- [ ] 3.1 Test: audit log populated after successful tool call — query `audit_log` table, verify row with status="success", correct app_name, tool_name, arguments, duration_ms > 0
- [ ] 3.2 Test: audit log shows "denied" for unknown tool call — call unknown tool, query audit_log, verify status="denied"

## 4. Approval Workflow Tests

- [ ] 4.1 Test: approval-required tool auto-denies after TTL — configure server with approval patterns matching a filesystem tool, call that tool, verify it auto-denies after short TTL, verify audit log shows status="timeout"

## 5. Cleanup

- [ ] 5.1 Delete `tests/integration/mcp-proxy.sh` (replaced by the new Vitest test)
