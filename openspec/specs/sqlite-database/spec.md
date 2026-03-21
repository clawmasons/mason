# sqlite-database Specification

> **DEPRECATED** — This spec is no longer implemented. The SQLite database layer (`db.ts`, `better-sqlite3`) was removed in Change #6 (Audit Events via Relay + Remove SQLite) of the host-proxy PRD. Audit logging is now handled via relay `audit_event` messages, and host-side persistence uses JSONL via `AuditWriter`. Approval workflows use relay request/response. Credential audit uses the `AuditEmitter` callback pattern.

## Previous Purpose
Provided a shared SQLite database layer for the proxy, supporting audit logging of all tool calls and approval request workflows.

## Replacement
- **Audit logging**: `audit_event` relay messages (fire-and-forget via `RelayServer.send()`) + host-side `AuditWriter` JSONL persistence
- **Approval requests**: Relay `approval_request`/`approval_response` messages via `RelayServer.request()`
- **Credential audit**: `AuditEmitter` callback on `CredentialService`
