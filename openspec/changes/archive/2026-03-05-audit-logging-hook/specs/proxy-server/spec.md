## MODIFIED Requirements

### Requirement: tools/call resolves via ToolRouter and forwards to UpstreamManager
The `tools/call` handler SHALL:
1. Call `router.resolve(name)` with the prefixed tool name from the request
2. If `db` is configured, call `auditPreHook(context)` to capture start time and entry ID
3. If resolved, call `upstream.callTool(route.appName, route.originalToolName, args)`
4. If `db` is configured, call `auditPostHook()` with the result and status (success/error/denied)
5. Return the upstream result to the runtime

For denied calls (resolve returns null): if `db` is configured, call `auditPreHook()` then immediately `auditPostHook()` with status "denied" before returning the error response.

#### Scenario: Successful tool call with audit logging
- **WHEN** a runtime calls `tools/call` with name `github_create_pr` and arguments `{ title: "Fix bug" }`
- **AND** `router.resolve("github_create_pr")` returns a valid route
- **AND** `db` is configured on the server
- **THEN** the proxy calls `auditPreHook()` before the upstream call
- **AND** calls `upstream.callTool()` to get the result
- **AND** calls `auditPostHook()` with the result and status `"success"`
- **AND** returns the upstream result to the runtime

#### Scenario: Successful tool call without audit logging
- **WHEN** a runtime calls `tools/call` with a valid tool name
- **AND** `db` is NOT configured on the server
- **THEN** the proxy calls `upstream.callTool()` and returns the result
- **AND** no audit hooks are called

#### Scenario: Denied tool call with audit logging
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `router.resolve("github_delete_repo")` returns `null`
- **AND** `db` is configured on the server
- **THEN** the proxy calls `auditPreHook()` and `auditPostHook()` with status `"denied"`
- **AND** returns `{ content: [{ type: "text", text: "Unknown tool: github_delete_repo" }], isError: true }`

#### Scenario: Upstream error with audit logging
- **WHEN** a runtime calls `tools/call` with a valid tool name
- **AND** the upstream `callTool()` throws an error with message "Connection refused"
- **AND** `db` is configured
- **THEN** the proxy calls `auditPostHook()` with status `"error"` and the error message
- **AND** returns `{ content: [{ type: "text", text: "Connection refused" }], isError: true }`

## ADDED Requirements

### Requirement: ForgeProxyServerConfig accepts optional database and agent context
The `ForgeProxyServerConfig` interface SHALL accept an optional `db` field (a `better-sqlite3` Database instance) and an optional `agentName` field (string, defaults to `"unknown"`). When `db` is provided, audit logging is active for all tool calls.

#### Scenario: Config with database enables audit logging
- **WHEN** `ForgeProxyServer` is constructed with `{ db: <Database>, agentName: "note-taker", ... }`
- **THEN** all `tools/call` requests are audit-logged to the provided database

#### Scenario: Config without database disables audit logging
- **WHEN** `ForgeProxyServer` is constructed without a `db` field
- **THEN** `tools/call` requests proceed without audit logging
