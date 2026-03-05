## Context

The forge proxy server (`src/proxy/server.ts`) currently handles `tools/call` requests with a straightforward flow: resolve via `ToolRouter` → forward to `UpstreamManager` → return result. There's no observability — no logging of what was called, whether it succeeded, or how long it took.

The SQLite database layer (`src/proxy/db.ts`) already provides `insertAuditLog()` and `queryAuditLog()` functions with the full `AuditLogEntry` type (id, agent_name, role_name, app_name, tool_name, arguments, result, status, duration_ms, timestamp). The schema matches PRD REQ-008 exactly.

This change wires them together and lays the foundation for the hook pipeline (REQ-013) that future hooks (approval, rate limiting) will plug into.

## Goals / Non-Goals

**Goals:**
- Log every `tools/call` to SQLite with full context (agent, app, tool, arguments, result, status, duration)
- Log denied tool calls (unknown/filtered) with status "denied"
- Introduce a hook context type and audit hook functions that future hooks can follow
- Extend `ForgeProxyServerConfig` to accept a database instance and agent metadata

**Non-Goals:**
- Formal hook pipeline with ordering/chaining — that's CHANGE 6's concern
- Approval workflow — separate hook (CHANGE 6)
- Hook plugin loading or custom hooks — future P2 work
- Logging resources/prompts passthrough — tools only per REQ-005

## Decisions

### 1. Audit hook as standalone functions, not a class

**Decision:** Export `auditPreHook()` and `auditPostHook()` functions from `src/proxy/hooks/audit.ts` rather than using a Hook class hierarchy.

**Rationale:** The PRD's hook pipeline (REQ-013) describes ordered pre/post hooks, but CHANGE 5 only needs audit. A function-based approach is simpler now and doesn't preclude a class-based pipeline later. The approval hook (CHANGE 6) can formalize the pipeline when it needs ordering semantics.

**Alternative considered:** Abstract `Hook` class with `pre()` and `post()` methods. Rejected — premature abstraction for a single hook.

### 2. Integrate hooks directly in the CallToolRequestSchema handler

**Decision:** Modify the `createMcpServer()` method in `server.ts` to call audit hooks inline, rather than introducing a middleware layer.

**Rationale:** The current handler is ~25 lines. Adding pre/post audit calls keeps it readable and avoids introducing an abstraction layer before it's needed. When CHANGE 6 adds approval, the handler can be refactored into a pipeline if the inline approach gets unwieldy.

### 3. Pass database and agent context via ForgeProxyServerConfig

**Decision:** Add optional `db` (Database instance) and `agentName` (string) fields to `ForgeProxyServerConfig`. When `db` is provided, audit logging is active. When absent, tool calls proceed without logging.

**Rationale:** Making audit optional via config means existing tests don't break, and the proxy can run without a database for development/testing. The `agentName` is a simple string since the proxy always serves a single agent.

### 4. Use "unknown" as default role_name

**Decision:** Since the current proxy doesn't have per-request role context (REQ-015 is P2), use `"unknown"` as the `role_name` in audit entries.

**Rationale:** The audit schema requires `role_name` (NOT NULL). Per-request role headers are a future feature. Using "unknown" is honest and queryable. When per-request roles are added, audit entries will get real role names.

### 5. Pre-hook writes a complete entry; post-hook updates in-place

**Decision:** The pre-hook inserts a full `AuditLogEntry` with status "pending" (we'll use a two-phase approach but keep it simple: pre-hook just captures the start timestamp and generates the ID; post-hook writes the complete entry with result and duration).

**Revised decision:** Actually, write the entry once in the post-hook with all data. The pre-hook only captures the start time and generates the ID. This avoids needing an UPDATE query and keeps the db layer unchanged.

**Rationale:** The `insertAuditLog()` function does a single INSERT. We don't have an `updateAuditLog()` function and don't need one. Capturing start time in pre-hook and writing everything in post-hook is simpler.

For denied calls: write immediately since there's no upstream call to wait for.

## Risks / Trade-offs

- **[Synchronous SQLite in async handler]** `better-sqlite3` is synchronous. `insertAuditLog()` blocks the event loop briefly. → Mitigation: SQLite WAL mode makes writes fast (~0.1ms). Acceptable for v1. If it becomes a bottleneck, batch writes can be added later.

- **[No role context]** Audit entries show `role_name: "unknown"` until per-request role enforcement (P2). → Mitigation: All other fields (agent, app, tool, args, result) provide sufficient observability for v1.

- **[Audit failure shouldn't break tool calls]** If `insertAuditLog()` throws (e.g., disk full), the tool call should still succeed. → Mitigation: Wrap audit writes in try/catch. Log errors to stderr but don't propagate.
