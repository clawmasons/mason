## Context

The forge proxy server (`src/proxy/server.ts`) currently handles `tools/call` with: resolve route → audit pre-hook → upstream call → audit post-hook. There is no enforcement gate between the audit pre-hook and the upstream call. The PRD requires that tool calls matching glob patterns in `role.constraints.requireApprovalFor` be paused pending human approval (REQ-006, REQ-007).

The database layer (`src/proxy/db.ts`) already has the `approval_requests` table and CRUD functions: `createApprovalRequest()`, `getApprovalRequest()`, `updateApprovalStatus()`. The approval hook needs to write a pending request, then poll until the status changes or the TTL expires.

## Goals / Non-Goals

**Goals:**
- Match prefixed tool names against glob patterns from `requireApprovalFor` (simple `*` wildcard)
- Create pending approval requests in SQLite for matching tools
- Poll for status changes with configurable interval (default 1 second)
- Auto-deny after TTL expiry (default 300 seconds), setting `resolved_by` to `"auto-timeout"`
- Integrate into server's `tools/call` handler between audit pre-hook and upstream call
- Extend `ForgeProxyServerConfig` with `approvalPatterns` (string array)

**Non-Goals:**
- Formal hook pipeline with ordering/chaining — keep the inline approach from CHANGE 5
- Notification/webhook when approval is requested — that's for the TUI (separate PRD) or future REQ-016
- Rate limiting or cost estimation hooks — future P2
- Per-request role context — P2 feature

## Decisions

### 1. Simple glob matching with `*` wildcard, no external dependency

**Decision:** Implement a simple `matchesApprovalPattern()` function that converts `*` wildcards to regex `[^]*` patterns. No `minimatch` dependency.

**Rationale:** The PRD patterns are simple (e.g., `github_delete_*`, `*_send_*`). A basic conversion of `*` → `[^]*` with proper escaping handles all documented use cases. Adding `minimatch` for this is unnecessary overhead.

### 2. Polling-based approval check with configurable interval and TTL

**Decision:** `requestApproval()` creates a pending request, then polls `getApprovalRequest()` every `pollIntervalMs` (default 1000ms) until status changes or TTL expires. On TTL expiry, call `updateApprovalStatus(id, "denied", "auto-timeout")`.

**Rationale:** The PRD specifies polling with 5-minute TTL. SQLite WAL mode handles concurrent reads efficiently. The TUI (or other external process) updates the approval_requests table directly. 1-second polling is a reasonable balance between responsiveness and overhead.

**Alternative considered:** Event-driven with file watchers or SQLite triggers. Rejected — adds complexity for marginal latency improvement. Polling is simple and reliable.

### 3. Approval patterns as flat string array in server config

**Decision:** Add `approvalPatterns?: string[]` to `ForgeProxyServerConfig`. The caller (future `forge proxy` CLI command) is responsible for collecting all `requireApprovalFor` patterns from all roles into a single union array.

**Rationale:** The proxy enforces the union of all role permissions (PRD §4 Non-Goals). Similarly, approval patterns should be the union from all roles. Passing a flat array keeps the server config simple and decouples it from the role resolution logic.

### 4. Approval check happens after route resolution, before upstream call

**Decision:** In the `tools/call` handler: resolve route → audit pre-hook → approval check (if patterns match) → upstream call → audit post-hook. If approval is denied or times out, skip the upstream call and log via audit post-hook with appropriate status.

**Rationale:** This follows the PRD's tool call flow (§6.3). Denied/timed-out calls should be audited. The audit pre-hook already ran, so the post-hook captures the final "denied" or "timeout" status.

### 5. Return descriptive error messages for denied/timed-out approvals

**Decision:** On denial, return `"Tool call denied: <prefixedToolName> requires approval (denied by <resolved_by>)"`. On timeout, return `"Tool call timed out: <prefixedToolName> approval expired after <ttl> seconds"`.

**Rationale:** The runtime (Claude Code, etc.) needs actionable feedback. Including the tool name and reason helps the agent understand what happened and potentially retry or adjust.

## Risks / Trade-offs

- **[Blocking event loop during poll]** `requestApproval()` is async and uses `setTimeout`-based polling, so it doesn't block the event loop. However, the MCP server's request handler is blocked waiting for the promise. → Mitigation: This is intentional — the tool call must wait for approval. Other MCP requests (tools/list) continue working since they're handled by separate request handlers.

- **[Poll interval overhead]** 1-second polling means up to 300 SQLite reads for a 5-minute TTL. → Mitigation: SQLite WAL mode makes reads fast (~0.01ms). 300 reads over 5 minutes is negligible.

- **[Race between timeout and external approval]** If TTL expires at the exact moment an approval is written, the hook may auto-deny after the approval was set. → Mitigation: Check status one final time before writing the auto-deny. Use the existing status as a guard.
