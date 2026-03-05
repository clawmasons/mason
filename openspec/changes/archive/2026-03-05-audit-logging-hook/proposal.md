## Why

Every tool call through the forge proxy currently executes with zero observability — there's no record of what was called, whether it succeeded, or how long it took. The SQLite database layer (CHANGE 1) already provides `insertAuditLog()` and `queryAuditLog()` functions, and the proxy server (CHANGE 4) handles tool calls, but they aren't wired together. Adding audit logging is the first step toward the hook pipeline architecture (REQ-013) and fulfills REQ-005 (Audit Logging).

## What Changes

- Introduce a hook pipeline abstraction for the proxy's tool call flow (pre-hook / post-hook pattern)
- Create an audit logging hook that records every tool call to `audit_log` in SQLite
- Pre-hook: logs the request (agent, app, tool, arguments, timestamp) with status "pending"
- Post-hook: updates the entry with result, final status (success/error/denied), and duration_ms
- Denied tool calls (unknown/filtered tools) are also logged with status "denied"
- Wire the hook into the proxy server's `tools/call` handler
- Pass database instance and agent context (agent_name, role_name) into the server config

## Capabilities

### New Capabilities
- `audit-logging-hook`: The audit hook implementation, hook context types, and hook pipeline integration into the proxy server's tool call flow

### Modified Capabilities
- `proxy-server`: The server's `tools/call` handler now executes pre/post hooks around upstream calls, and the server config accepts a database instance and agent metadata

## Impact

- **New file:** `src/proxy/hooks/audit.ts` — audit hook implementation
- **Modified file:** `src/proxy/server.ts` — integrate hook pipeline into tools/call handler, extend config with db and agent context
- **New test:** `tests/proxy/hooks/audit.test.ts`
- **Modified test:** `tests/proxy/server.test.ts` — verify hooks are called during tool call flow
- **Dependencies:** Uses existing `src/proxy/db.ts` (no new dependencies)
