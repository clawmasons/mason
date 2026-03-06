## ADDED Requirements

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
