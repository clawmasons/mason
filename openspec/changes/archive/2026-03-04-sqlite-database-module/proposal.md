## Why

The forge proxy (PRD: forge-proxy) needs a shared SQLite database layer to support audit logging and approval workflows. Every tool call flowing through the proxy must be recorded, and certain tool calls require human approval before execution. Both features depend on a reliable, typed database module that handles connection management, schema creation, and CRUD operations.

Without this module, the proxy hooks (audit and approval) have no persistence layer and cannot be implemented.

**PRD refs:** REQ-008 (SQLite Database Schema), REQ-005 (Audit Logging), REQ-006 (Approval Workflow)

## What Changes

- **New file: `src/proxy/db.ts`** — SQLite database module with:
  - `openDatabase(dbPath?)` — opens/creates `~/.forge/forge.db`, enables WAL mode, creates tables
  - `insertAuditLog(entry)` — insert audit log row
  - `queryAuditLog(filters?)` — query audit log with optional filters
  - `createApprovalRequest(req)` — insert pending approval request
  - `getApprovalRequest(id)` — fetch approval request by ID
  - `updateApprovalStatus(id, status, resolvedBy?)` — update approval request status

- **New file: `tests/proxy/db.test.ts`** — Unit tests using in-memory SQLite

- **New dependency: `better-sqlite3`** — synchronous SQLite3 binding for Node.js

## Capabilities

### New Capabilities
- `sqlite-database`: Shared SQLite database layer for audit logging and approval workflows with typed insert/query functions, WAL mode, and auto-schema creation

## Impact

- **New:** `src/proxy/db.ts` — database module
- **New:** `tests/proxy/db.test.ts` — database tests
- **New dependency:** `better-sqlite3` + `@types/better-sqlite3`
- **No existing files modified**
