# Audit Logging Hook

The audit hook implementation that records every tool call, providing full observability into the proxy's tool call pipeline. Defines the HookContext type, pre/post hook functions, and error resilience guarantees. Audit events are sent via relay messages (fire-and-forget) and persisted as JSONL on the host side.

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

### Requirement: auditPostHook sends an audit event via relay
The `auditPostHook()` function SHALL accept the HookContext, the AuditPreHookResult, the call result (or undefined), the status (`AuditStatus`), and a `RelayServer | null`. It SHALL create an `audit_event` relay message via `createRelayMessage()` and send it with `relay.send()` (fire-and-forget). If relay is null, the function is a no-op.

#### Scenario: Successful tool call logged via relay
- **WHEN** `auditPostHook()` is called with status `"success"`, a result, and a connected relay
- **THEN** `relay.send()` is called with an `audit_event` message containing the correct agent_name, role_name, app_name, tool_name, JSON-stringified arguments, JSON-stringified result, status `"success"`, duration_ms > 0, and an ISO timestamp

#### Scenario: Failed tool call logged
- **WHEN** `auditPostHook()` is called with status `"error"` and an error message as result
- **THEN** `relay.send()` is called with an `audit_event` message with status `"error"` and the error message as result

#### Scenario: Denied tool call logged
- **WHEN** a tool call is denied (unknown/filtered tool) and `auditPostHook()` is called with status `"denied"`
- **THEN** `relay.send()` is called with an `audit_event` message with status `"denied"`, result as the denial message, and duration_ms as 0 or undefined

#### Scenario: Null relay is a no-op
- **WHEN** `auditPostHook()` is called with relay as null
- **THEN** no audit event is sent and the function returns without error

### Requirement: Audit logging failure SHALL NOT break tool calls
If `relay.send()` throws an error, the audit hook SHALL catch the error and log it to stderr. The tool call SHALL proceed or return its result normally — audit failures MUST NOT propagate to the caller.

#### Scenario: Relay send failure is swallowed
- **WHEN** `auditPostHook()` is called and `relay.send()` throws an error
- **THEN** the error is caught and logged to stderr
- **AND** the tool call result is returned to the runtime normally

### Requirement: HookContext supports ACP session metadata
The `HookContext` interface SHALL contain optional fields `sessionType` (string, e.g., `"acp"`) and `acpClient` (string, e.g., `"zed"`). When provided, these values SHALL be included in the audit event message.

#### Scenario: ACP tool call logged with session metadata
- **WHEN** `auditPostHook()` is called with a context that has `sessionType: "acp"` and `acpClient: "zed"`
- **THEN** `relay.send()` is called with a message containing session metadata

#### Scenario: Direct proxy call logged without session metadata
- **WHEN** `auditPostHook()` is called with a context that has no `sessionType` or `acpClient`
- **THEN** `relay.send()` is called with a message without session metadata fields

### Requirement: logDroppedServers logs each dropped MCP server as an audit entry
The `logDroppedServers(relay, unmatched, agentName, roleName, acpClient?)` function SHALL create one `audit_event` relay message per dropped server with `status: "dropped"`, the server name as both `app_name` and `tool_name`, the drop reason as `result`, and `duration_ms: 0`. Relay send failures SHALL be caught and logged to stderr (same resilience as `auditPostHook`). If relay is null, the function is a no-op.

#### Scenario: Dropped servers logged
- **WHEN** `logDroppedServers()` is called with two unmatched servers and a connected relay
- **THEN** two `audit_event` messages are sent via `relay.send()` with `status: "dropped"`

#### Scenario: Empty unmatched list is a no-op
- **WHEN** `logDroppedServers()` is called with an empty unmatched list
- **THEN** no audit events are sent

#### Scenario: Relay send failure for dropped servers is swallowed
- **WHEN** `logDroppedServers()` is called and `relay.send()` throws an error
- **THEN** the error is caught and logged to stderr
- **AND** the function does not throw

### Requirement: AuditStatus type includes "dropped"
The `AuditStatus` type SHALL accept `"dropped"` as a valid status value, in addition to `"success"`, `"error"`, `"denied"`, and `"timeout"`.

### Requirement: AuditWriter persists events as JSONL on the host
The `AuditWriter` class SHALL accept an optional `{ filePath?: string }` config (defaulting to `~/.mason/data/audit.jsonl`). The `write(event)` method SHALL append a single JSON line using `appendFileSync`, creating the parent directory if needed. The `close()` method SHALL be a no-op (safe to call multiple times).

#### Scenario: Single event written as JSONL
- **WHEN** `writer.write(event)` is called
- **THEN** the event is appended as a single JSON line to the configured file

#### Scenario: Multiple events appended
- **WHEN** `writer.write()` is called three times
- **THEN** the file contains three JSON lines

#### Scenario: Directory created if missing
- **WHEN** `writer.write()` is called and the parent directory does not exist
- **THEN** the directory is created recursively before writing
