## Why

The Docker proxy currently depends on `better-sqlite3` (a heavy native module) for audit logging and approval polling. Audit events written to SQLite inside Docker are ephemeral — lost when the container stops. The relay protocol (Changes 1-5) established a multiplexed WebSocket, but audit hooks still write to SQLite via `insertAuditLog(db, ...)`. This change replaces SQLite audit logging with fire-and-forget `audit_event` relay messages, creates a host-side JSONL audit writer, and removes `better-sqlite3` from the proxy package entirely.

## What Changes

- Modify `packages/proxy/src/hooks/audit.ts` — replace `insertAuditLog(db, ...)` calls with `relay.send(auditEventMessage)`. Remove all `better-sqlite3` and `db.ts` imports. The `auditPostHook` and `logDroppedServers` functions take a `RelayServer` instead of a `Database`.
- New `packages/proxy/src/audit/writer.ts` — `AuditWriter` class that receives `AuditEventMessage` objects and appends them as JSONL to `~/.mason/data/audit.jsonl`.
- Delete `packages/proxy/src/db.ts` — all SQLite operations removed.
- Modify `packages/proxy/src/server.ts` — remove `db` from `ProxyServerConfig`, pass `RelayServer` to audit hooks instead of `Database`. Remove `better-sqlite3` type imports.
- Modify `packages/proxy/package.json` — remove `better-sqlite3` from dependencies.
- Modify `packages/proxy/src/index.ts` — remove DB exports, add `AuditWriter` export.
- Modify `packages/proxy/src/credentials/audit.ts` — remove SQLite operations, keep only the `AuditEmitter` type and `CredentialAuditEntry` type (no DB dependency).
- Modify `packages/proxy/src/credentials/service.ts` — remove DB dependency, accept `AuditEmitter` as required parameter.
- Update all tests to use relay mocks instead of SQLite.

## Capabilities

### New Capabilities
- `audit-writer`: Host-side JSONL audit writer (`AuditWriter` class) that persists `audit_event` messages to `~/.mason/data/audit.jsonl`.

### Modified Capabilities
- `audit-hooks`: Audit pre/post hooks now emit relay `audit_event` messages instead of writing to SQLite.
- `proxy-server-config`: `ProxyServerConfig` no longer has a `db` field.

### Removed Capabilities
- `sqlite-database`: `openDatabase()`, `insertAuditLog()`, `queryAuditLog()`, `createApprovalRequest()`, `getApprovalRequest()`, `updateApprovalStatus()` — all removed with `db.ts`.

## Impact

- **Modified:** `packages/proxy/src/hooks/audit.ts`, `packages/proxy/src/server.ts`, `packages/proxy/src/index.ts`, `packages/proxy/package.json`, `packages/proxy/src/credentials/audit.ts`, `packages/proxy/src/credentials/service.ts`, `packages/proxy/src/credentials/index.ts`
- **New:** `packages/proxy/src/audit/writer.ts`, `packages/proxy/tests/audit/writer.test.ts`
- **Deleted:** `packages/proxy/src/db.ts`, `packages/proxy/tests/db.test.ts`
- **Modified tests:** `packages/proxy/tests/hooks/audit.test.ts`, `packages/proxy/tests/hooks/approval.test.ts`, `packages/proxy/tests/server.test.ts`, `packages/proxy/tests/integration-proxy.test.ts`, `packages/proxy/tests/credentials/audit.test.ts`
- **CLI impact:** `packages/cli/src/cli/commands/proxy.ts` — remove `openDatabase` import and `db` usage; `packages/cli/tests/cli/proxy.test.ts` — remove `openDatabase` mock.
- **Dependencies removed:** `better-sqlite3` from proxy package
- **PRD refs:** REQ-008, REQ-009, REQ-015
