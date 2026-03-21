## Context

Changes 1-5 established the relay protocol with typed messages including `AuditEventSchema`. The audit hooks (`hooks/audit.ts`) currently import `better-sqlite3` and `db.ts` to write audit entries to SQLite. The approval hooks also depend on `db.ts` for SQLite-based polling. This change removes all SQLite from the proxy package by:

1. Converting audit hooks to emit relay messages
2. Creating a host-side JSONL writer
3. Removing `db.ts` and `better-sqlite3`
4. Updating the credential service audit to not depend on SQLite

The approval hook (`hooks/approval.ts`) also uses SQLite but will be fully replaced in Change 7 (Approvals via Relay). For this change, the approval hook's signature changes to accept a `RelayServer` but still uses a stub implementation that auto-denies (since the relay-based approval is Change 7's scope). This is acceptable because the approval hook is only invoked when `approvalPatterns` is configured, which requires the relay to be active.

## Goals / Non-Goals

**Goals:**
- Audit hooks emit `audit_event` messages via `RelayServer.send()` (fire-and-forget)
- `AuditWriter` class appends JSONL to `~/.mason/data/audit.jsonl` on the host
- `better-sqlite3` completely removed from proxy package
- `db.ts` deleted
- `ProxyServerConfig.db` field removed
- Credential service's `CredentialService` no longer opens a SQLite database
- All existing tests updated to work without SQLite

**Non-Goals:**
- Approval flow via relay (Change 7)
- Host proxy orchestrator wiring (Change 8)
- Querying audit logs (no replacement for `queryAuditLog` — JSONL can be grep'd)

## Decisions

### D1: Fire-and-forget audit events (no acknowledgment)

**Choice:** `relay.send()` instead of `relay.request()` for audit events.

**Rationale:** Audit events are observability data. Blocking tool calls on audit write acknowledgment adds latency without clear benefit. If the relay is disconnected, the event is silently dropped with a console warning — matching the existing behavior where SQLite write errors are caught and logged.

### D2: AuditWriter uses synchronous `appendFileSync`

**Choice:** Use `fs.appendFileSync` for JSONL writes.

**Rationale:** Audit events arrive one at a time from relay messages. Synchronous append is simpler than managing async file handles, and JSONL writes are fast (< 1ms). The writer is on the host side, not in the hot path of tool calls. Using `appendFileSync` also guarantees atomicity of individual line writes within a single process.

### D3: Approval hook becomes a stub in this change

**Choice:** The approval hook's `requestApproval()` function will be updated to use `RelayServer.request()` to send `approval_request` messages and await `approval_response`. This prepares the API for Change 7 but the host-side handler is not implemented until then.

**Rationale:** We can't keep the SQLite-based polling since we're deleting `db.ts`. The relay-based signature is the correct final API. Change 7 will implement the host-side dialog handler.

### D4: Credential service audit becomes emitter-based (no SQLite)

**Choice:** `CredentialService` accepts an `AuditEmitter` callback. The `openCredentialDatabase` and SQLite functions are removed from `credentials/audit.ts`. Only the types (`AuditEmitter`, `CredentialAuditEntry`) survive.

**Rationale:** The credential service is now inside the proxy package and runs on the host side. Audit emission will be wired to the `AuditWriter` in Change 8 (host proxy orchestrator). For now, the service accepts an emitter callback — defaulting to a no-op if none is provided.

## Module Changes

### `packages/proxy/src/hooks/audit.ts`

```typescript
// Remove: import type Database from "better-sqlite3"
// Remove: import { generateId, insertAuditLog } from "../db.js"
// Add: import { randomUUID } from "node:crypto"
// Add: import { createRelayMessage, type AuditEventMessage } from "../relay/messages.js"
// Add: import type { RelayServer } from "../relay/server.js"

// auditPreHook — unchanged (generates id + startTime)
// auditPostHook — signature changes: db → relay: RelayServer | null
//   Creates AuditEventMessage, sends via relay.send() with try/catch
// logDroppedServers — signature changes: db → relay: RelayServer | null
```

### `packages/proxy/src/hooks/approval.ts`

```typescript
// Remove: all db.ts imports
// Add: import { createRelayMessage } from "../relay/messages.js"
// Add: import type { RelayServer } from "../relay/server.js"
// Add: import type { ApprovalResponseMessage } from "../relay/messages.js"

// requestApproval — signature changes: db → relay: RelayServer
//   Sends approval_request via relay.request(), awaits approval_response
//   Timeout = TTL in seconds
```

### `packages/proxy/src/audit/writer.ts`

```typescript
export class AuditWriter {
  private readonly filePath: string;

  constructor(config?: { filePath?: string });
  write(event: AuditEventMessage): void;  // appendFileSync + JSON.stringify + \n
  close(): void;  // no-op (appendFileSync doesn't hold a handle)
}
```

### `packages/proxy/src/server.ts`

- Remove `db` from `ProxyServerConfig`
- Remove `import type Database from "better-sqlite3"`
- Pass `this.relayServer` to `auditPostHook` and `logDroppedServers` instead of `db`
- Approval check passes `this.relayServer` to `requestApproval` instead of `db`
- Audit logging is always attempted when `this.relayServer` is available (was gated on `db`)

### `packages/proxy/src/credentials/audit.ts`

- Remove: `Database` import, `openCredentialDatabase()`, `insertCredentialAudit()`, `queryCredentialAudit()`, `createSqliteAuditEmitter()`
- Keep: `AuditEmitter` type, `CredentialAuditEntry` interface, `generateAuditId()`

### `packages/proxy/src/credentials/service.ts`

- Remove: `openCredentialDatabase` import
- Constructor no longer opens a database
- `AuditEmitter` is required or defaults to no-op
- Remove `close()` and `getDatabase()` methods that referenced the DB

## Test Coverage

### New: `packages/proxy/tests/audit/writer.test.ts`
- Writes a single event as JSONL
- Appends multiple events (one per line)
- Creates parent directory if it doesn't exist
- Handles concurrent writes
- `close()` is safe to call multiple times

### Modified: `packages/proxy/tests/hooks/audit.test.ts`
- Replace SQLite DB with a mock `RelayServer`
- Verify `relay.send()` is called with correct `AuditEventMessage` shape
- Verify errors in `relay.send()` are caught and logged

### Modified: `packages/proxy/tests/hooks/approval.test.ts`
- Replace SQLite DB with a mock `RelayServer`
- Verify `relay.request()` is called with `approval_request` message
- Verify timeout behavior via relay request timeout

### Modified: `packages/proxy/tests/server.test.ts`
- Remove SQLite DB setup/teardown
- Use relay server mock for audit verification
- Update approval tests to work with relay-based approval

### Modified: `packages/proxy/tests/integration-proxy.test.ts`
- Remove SQLite DB setup
- Use relay server for audit verification (or skip audit assertions)

### Modified: `packages/proxy/tests/credentials/audit.test.ts`
- Remove SQLite-specific tests
- Test `generateAuditId()` and `AuditEmitter` type only

### Modified: `packages/cli/src/cli/commands/proxy.ts`
- Remove `openDatabase` import and `db` variable
- Remove `db` from `ProxyServer` config
- Remove `db.close()` from shutdown handler

### Modified: `packages/cli/tests/cli/proxy.test.ts`
- Remove `openDatabase` mock
