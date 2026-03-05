## Why

The forge proxy has audit logging (CHANGE 5) but no enforcement gate — every tool call that passes the role-based filter executes immediately. The PRD requires an approval workflow (REQ-006, REQ-007) where tool calls matching glob patterns in `role.constraints.requireApprovalFor` are paused until a human approves or denies them (or they auto-deny after a 5-minute TTL). The SQLite database layer already has `createApprovalRequest()`, `getApprovalRequest()`, and `updateApprovalStatus()` functions ready to use. This change adds the approval hook that sits between audit pre-hook and the upstream call in the tool call pipeline.

## What Changes

- Create `src/proxy/hooks/approval.ts` with glob pattern matching and approval request/polling logic
- Two exported functions: `matchesApprovalPattern()` for glob matching and `requestApproval()` for the blocking approval flow
- Modify `src/proxy/server.ts` to accept `approvalPatterns` in config and call the approval hook before upstream calls
- After audit pre-hook but before upstream call: check if tool matches approval patterns → if yes, create pending approval request and poll until resolved
- Auto-deny on TTL expiry (default 300 seconds)
- Audit post-hook records final status including "denied" for rejected approvals and "timeout" for expired ones

## Capabilities

### New Capabilities
- `approval-workflow-hook`: Glob pattern matching against prefixed tool names and blocking approval request flow with polling and TTL-based auto-deny

### Modified Capabilities
- `proxy-server`: The server's `tools/call` handler now checks approval patterns before upstream calls, and the server config accepts `approvalPatterns` (string array)

## Impact

- **New file:** `src/proxy/hooks/approval.ts` — approval hook implementation
- **Modified file:** `src/proxy/server.ts` — integrate approval check into tools/call handler, extend config with approvalPatterns
- **New test:** `tests/proxy/hooks/approval.test.ts`
- **Modified test:** `tests/proxy/server.test.ts` — verify approval flow in tool call pipeline
- **Dependencies:** Uses existing `src/proxy/db.ts` (no new dependencies)
