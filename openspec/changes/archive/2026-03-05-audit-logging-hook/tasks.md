## 1. Audit Hook Module

- [x] 1.1 Create `src/proxy/hooks/audit.ts` with `HookContext` and `AuditPreHookResult` types
- [x] 1.2 Implement `auditPreHook(context: HookContext)` — generates UUID and captures `Date.now()`
- [x] 1.3 Implement `auditPostHook(context, preResult, callResult, status, db)` — computes duration, JSON-stringifies arguments/result, calls `insertAuditLog()` wrapped in try/catch

## 2. Server Integration

- [x] 2.1 Extend `ForgeProxyServerConfig` with optional `db` (Database) and `agentName` (string) fields
- [x] 2.2 Modify `createMcpServer()` CallToolRequestSchema handler to call `auditPreHook`/`auditPostHook` around upstream calls when `db` is configured
- [x] 2.3 Add audit logging for denied tool calls (when `router.resolve()` returns null)

## 3. Tests

- [x] 3.1 Create `tests/proxy/hooks/audit.test.ts` — unit tests for `auditPreHook` (returns id + startTime), `auditPostHook` (success, error, denied statuses, duration calculation, JSON serialization, error swallowing)
- [x] 3.2 Update `tests/proxy/server.test.ts` — add tests verifying audit hooks are called during tool calls when db is configured, and not called when db is absent
