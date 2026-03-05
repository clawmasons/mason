# sqlite-database Specification

## Purpose
Provide a shared SQLite database layer for the forge proxy, supporting audit logging of all tool calls and approval request workflows. The module handles connection management, schema creation, and typed CRUD operations.

## Requirements

### Requirement: Open database with WAL mode and auto-schema
The system SHALL open (or create) a SQLite database at the specified path (default `~/.forge/forge.db`), enable WAL journal mode, and create the `audit_log` and `approval_requests` tables if they do not exist.

#### Scenario: First-time database creation
- **WHEN** `openDatabase()` is called and `~/.forge/forge.db` does not exist
- **THEN** the file is created, WAL mode is enabled, and both `audit_log` and `approval_requests` tables exist

#### Scenario: Existing database
- **WHEN** `openDatabase()` is called and the database already exists with both tables
- **THEN** the database is opened, WAL mode is re-enabled, and tables are unchanged (CREATE IF NOT EXISTS)

#### Scenario: Custom database path
- **WHEN** `openDatabase(":memory:")` is called
- **THEN** an in-memory database is created with WAL mode and both tables

### Requirement: Insert audit log entry
The system SHALL insert a complete audit log row with id, agent_name, role_name, app_name, tool_name, arguments (JSON string), result (JSON string), status, duration_ms, and timestamp.

#### Scenario: Successful tool call log
- **WHEN** `insertAuditLog(db, { id: "abc", agent_name: "note-taker", role_name: "writer", app_name: "filesystem", tool_name: "read_file", arguments: '{"path":"/tmp"}', result: '{"content":"..."}', status: "success", duration_ms: 42, timestamp: "2026-03-04T00:00:00Z" })` is called
- **THEN** a row with all fields is inserted into the `audit_log` table

#### Scenario: Denied tool call log
- **WHEN** `insertAuditLog(db, { ..., status: "denied", result: undefined, duration_ms: undefined })` is called
- **THEN** a row is inserted with `result` and `duration_ms` as NULL

### Requirement: Query audit log with filters
The system SHALL query the `audit_log` table and return matching rows. Filters are optional: `agent_name`, `app_name`, `tool_name`, `status`, `limit`. Results are ordered by timestamp descending.

#### Scenario: Query all entries
- **WHEN** `queryAuditLog(db)` is called with no filters
- **THEN** all audit log entries are returned, newest first

#### Scenario: Query by app_name
- **WHEN** `queryAuditLog(db, { app_name: "github" })` is called
- **THEN** only entries with `app_name = "github"` are returned

#### Scenario: Query with limit
- **WHEN** `queryAuditLog(db, { limit: 10 })` is called and there are 50 entries
- **THEN** only the 10 most recent entries are returned

### Requirement: Create approval request
The system SHALL insert an approval request with status `pending` and all required fields.

#### Scenario: New approval request
- **WHEN** `createApprovalRequest(db, { id: "req-1", agent_name: "note-taker", role_name: "writer", app_name: "github", tool_name: "delete_repo", arguments: '{"repo":"test"}', status: "pending", requested_at: "2026-03-04T00:00:00Z", ttl_seconds: 300 })` is called
- **THEN** a row is inserted into `approval_requests` with status "pending" and resolved_at/resolved_by as NULL

### Requirement: Get approval request by ID
The system SHALL retrieve a single approval request by its ID, or return undefined if not found.

#### Scenario: Existing request
- **WHEN** `getApprovalRequest(db, "req-1")` is called and a request with that ID exists
- **THEN** the full `ApprovalRequest` object is returned

#### Scenario: Non-existent request
- **WHEN** `getApprovalRequest(db, "nonexistent")` is called
- **THEN** `undefined` is returned

### Requirement: Update approval status
The system SHALL update an approval request's status to `approved` or `denied`, set `resolved_at` to the current ISO timestamp, and optionally set `resolved_by`.

#### Scenario: Approve a request
- **WHEN** `updateApprovalStatus(db, "req-1", "approved", "operator@example.com")` is called
- **THEN** the request's status is "approved", resolved_at is set, resolved_by is "operator@example.com"

#### Scenario: Deny a request (auto-timeout)
- **WHEN** `updateApprovalStatus(db, "req-1", "denied", "auto-timeout")` is called
- **THEN** the request's status is "denied", resolved_by is "auto-timeout"

### Requirement: Schema matches PRD REQ-008
The `audit_log` and `approval_requests` table schemas SHALL match the SQL DDL defined in PRD section 5 REQ-008 exactly.

#### Scenario: Table columns
- **WHEN** the database is opened
- **THEN** `audit_log` has columns: id, agent_name, role_name, app_name, tool_name, arguments, result, status, duration_ms, timestamp
- **AND** `approval_requests` has columns: id, agent_name, role_name, app_name, tool_name, arguments, status, requested_at, resolved_at, resolved_by, ttl_seconds
