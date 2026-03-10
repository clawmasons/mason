# Audit Logging Hook

The audit hook implementation that records every tool call to SQLite, providing full observability into the proxy's tool call pipeline. Defines the HookContext type, pre/post hook functions, and error resilience guarantees.

## Requirements

### Requirement: HookContext type captures tool call metadata
The `HookContext` interface SHALL contain fields for: `agentName` (string), `roleName` (string), `appName` (string), `toolName` (string — original upstream name), `prefixedToolName` (string — the `<app>_<tool>` name), and `arguments` (unknown — the tool call arguments).

#### Scenario: HookContext populated from route entry
- **WHEN** a tool call is received with prefixed name `github_create_pr` and arguments `{ title: "Fix bug" }`
- **AND** the route resolves to appName `@clawmasons/app-github`, originalToolName `create_pr`, appShortName `github`
- **THEN** the HookContext SHALL contain `agentName` from server config, `roleName: "unknown"`, `appName: "@clawmasons/app-github"`, `toolName: "create_pr"`, `prefixedToolName: "github_create_pr"`, and `arguments: { title: "Fix bug" }`

### Requirement: auditPreHook captures start time and generates entry ID
The `auditPreHook(context: HookContext)` function SHALL record the current timestamp and generate a unique ID (UUID). It SHALL return an `AuditPreHookResult` containing the `id` and `startTime` (number, from `Date.now()`).

#### Scenario: Pre-hook returns tracking data
- **WHEN** `auditPreHook(context)` is called
- **THEN** it returns `{ id: "<uuid>", startTime: <timestamp> }` where id is a valid UUID and startTime is a number

### Requirement: auditPostHook writes a complete audit entry to SQLite
The `auditPostHook()` function SHALL accept the HookContext, the AuditPreHookResult, the call result (or undefined), the status, and a Database instance. It SHALL call `insertAuditLog()` with a complete `AuditLogEntry` including computed `duration_ms` (current time minus startTime).

#### Scenario: Successful tool call logged
- **WHEN** `auditPostHook()` is called with status `"success"` and a result
- **THEN** `insertAuditLog()` is called with an entry containing the correct agent_name, role_name, app_name, tool_name, JSON-stringified arguments, JSON-stringified result, status `"success"`, duration_ms > 0, and an ISO timestamp

#### Scenario: Failed tool call logged
- **WHEN** `auditPostHook()` is called with status `"error"` and an error message as result
- **THEN** `insertAuditLog()` is called with status `"error"` and the error message as result

#### Scenario: Denied tool call logged
- **WHEN** a tool call is denied (unknown/filtered tool) and `auditPostHook()` is called with status `"denied"`
- **THEN** `insertAuditLog()` is called with status `"denied"`, result as the denial message, and duration_ms as 0 or undefined

### Requirement: Audit logging failure SHALL NOT break tool calls
If `insertAuditLog()` throws an error (e.g., disk full, database locked), the audit hook SHALL catch the error and log it to stderr. The tool call SHALL proceed or return its result normally — audit failures MUST NOT propagate to the caller.

#### Scenario: Database write failure is swallowed
- **WHEN** `auditPostHook()` is called and `insertAuditLog()` throws an error
- **THEN** the error is caught and logged to stderr
- **AND** the tool call result is returned to the runtime normally

### Requirement: HookContext supports ACP session metadata
The `HookContext` interface SHALL contain optional fields `sessionType` (string, e.g., `"acp"`) and `acpClient` (string, e.g., `"zed"`). When provided, these values SHALL be included in the `AuditLogEntry` as `session_type` and `acp_client` columns. When not provided, the columns SHALL be NULL (backward compatible with direct proxy sessions).

#### Scenario: ACP tool call logged with session metadata
- **WHEN** `auditPostHook()` is called with a context that has `sessionType: "acp"` and `acpClient: "zed"`
- **THEN** `insertAuditLog()` is called with an entry containing `session_type: "acp"` and `acp_client: "zed"`

#### Scenario: Direct proxy call logged without session metadata
- **WHEN** `auditPostHook()` is called with a context that has no `sessionType` or `acpClient`
- **THEN** `insertAuditLog()` is called with an entry containing `session_type: null` and `acp_client: null`

### Requirement: logDroppedServers logs each dropped MCP server as an audit entry
The `logDroppedServers(db, unmatched, agentName, roleName, acpClient?)` function SHALL create one audit entry per dropped server with `status: "dropped"`, `session_type: "acp"`, the server name as both `app_name` and `tool_name`, the drop reason as `result`, and `duration_ms: 0`. Database write failures SHALL be caught and logged to stderr (same resilience as `auditPostHook`).

#### Scenario: Dropped servers logged
- **WHEN** `logDroppedServers()` is called with two unmatched servers
- **THEN** two audit entries are created with `status: "dropped"` and `session_type: "acp"`

#### Scenario: Empty unmatched list is a no-op
- **WHEN** `logDroppedServers()` is called with an empty unmatched list
- **THEN** no audit entries are created

#### Scenario: Database write failure for dropped servers is swallowed
- **WHEN** `logDroppedServers()` is called and `insertAuditLog()` throws an error
- **THEN** the error is caught and logged to stderr
- **AND** the function does not throw

### Requirement: AuditLogEntry status type includes "dropped"
The `AuditLogEntry.status` field SHALL accept `"dropped"` as a valid status value, in addition to the existing `"success"`, `"error"`, `"denied"`, and `"timeout"` values.

### Requirement: audit_log schema includes session_type and acp_client columns
The `audit_log` table SHALL contain nullable `session_type` (TEXT) and `acp_client` (TEXT) columns. These columns are added via `ALTER TABLE` migrations at database open time, wrapped in try/catch for idempotency. The `queryAuditLog` function SHALL support filtering by `session_type`.
