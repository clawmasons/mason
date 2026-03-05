## 1. Approval Hook Module

- [x] 1.1 Create `src/proxy/hooks/approval.ts` with `matchesApprovalPattern(prefixedToolName: string, patterns: string[]): boolean` — converts `*` to regex, tests match against prefixed name
- [x] 1.2 Implement `requestApproval(context: HookContext, db: Database, options?: { ttlSeconds?: number; pollIntervalMs?: number }): Promise<"approved" | "denied" | "timeout">` — creates pending approval request, polls for status changes, auto-denies on TTL expiry
- [x] 1.3 Add helper `sleep(ms: number): Promise<void>` for polling delay

## 2. Server Integration

- [x] 2.1 Extend `ForgeProxyServerConfig` with optional `approvalPatterns` (string[])
- [x] 2.2 Modify `createMcpServer()` CallToolRequestSchema handler to check `matchesApprovalPattern()` after route resolution and audit pre-hook
- [x] 2.3 If approval required: call `requestApproval()`, handle denied/timeout by calling `auditPostHook()` with appropriate status and returning error
- [x] 2.4 If approved: proceed with upstream call as normal

## 3. Tests

- [x] 3.1 Create `tests/proxy/hooks/approval.test.ts` — unit tests for `matchesApprovalPattern()` (exact match, wildcard prefix, wildcard suffix, wildcard middle, no match, empty patterns)
- [x] 3.2 Add tests for `requestApproval()` — approved flow (external update during poll), denied flow, timeout with auto-deny, custom TTL and poll interval
- [x] 3.3 Update `tests/proxy/server.test.ts` — add tests verifying approval integration: tool requiring approval is blocked then approved, approval denied returns error, no approval needed for non-matching tools
