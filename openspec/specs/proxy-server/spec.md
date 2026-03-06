# Proxy Server

The downstream-facing MCP server that aggregates upstream MCP apps through the ToolRouter and exposes them to agent runtimes over SSE or streamable-http.

## Requirements

### Requirement: ForgeProxyServer creates an MCP server named "forge"
The `ForgeProxyServer` class SHALL create an MCP `Server` instance with `name: "forge"` and `version: "0.1.0"`. The server SHALL declare the `tools` capability.

#### Scenario: Server identity
- **WHEN** a runtime connects to the proxy server
- **THEN** the MCP server identifies itself as `{ name: "forge", version: "0.1.0" }`

### Requirement: ForgeProxyServer starts an HTTP server on configurable port
The `ForgeProxyServer` SHALL start a `node:http` server on the port specified in its configuration. The `start()` method SHALL return a promise that resolves when the server is listening. The default port SHALL be 9090.

#### Scenario: Start on default port
- **WHEN** `ForgeProxyServer` is constructed with no port specified and `start()` is called
- **THEN** the HTTP server listens on port 9090

#### Scenario: Start on custom port
- **WHEN** `ForgeProxyServer` is constructed with `port: 3000` and `start()` is called
- **THEN** the HTTP server listens on port 3000

### Requirement: ForgeProxyServer supports SSE transport
When configured with `transport: "sse"`, the server SHALL handle:
- `GET /sse` — create a new `SSEServerTransport`, connect a new `Server` instance, and start the SSE stream
- `POST /messages` — forward the message body to the active `SSEServerTransport`

#### Scenario: SSE connection and tool listing
- **WHEN** a client connects via `GET /sse` and sends a `tools/list` request via `POST /messages`
- **THEN** the server returns the prefixed, filtered tool list from the `ToolRouter`

### Requirement: ForgeProxyServer supports streamable-http transport
When configured with `transport: "streamable-http"`, the server SHALL route all requests to `StreamableHTTPServerTransport.handleRequest()` for the MCP endpoint path.

#### Scenario: Streamable-http connection and tool listing
- **WHEN** a client connects via streamable-http and sends a `tools/list` request
- **THEN** the server returns the prefixed, filtered tool list from the `ToolRouter`

### Requirement: tools/list returns prefixed, filtered tools from ToolRouter
The `tools/list` handler SHALL delegate to `ToolRouter.listTools()` and return the result. The tools returned SHALL have prefixed names (e.g., `github_create_pr`) and SHALL only include tools allowed by role permissions.

#### Scenario: List tools returns router output
- **WHEN** a runtime calls `tools/list` through the proxy
- **THEN** the response contains exactly the tools returned by `router.listTools()`

#### Scenario: Empty tool list
- **WHEN** the `ToolRouter` has no tools (no upstreams or all filtered)
- **THEN** `tools/list` returns an empty array

### Requirement: tools/call resolves via ToolRouter and forwards to UpstreamManager
The `tools/call` handler SHALL:
1. Call `router.resolve(name)` with the prefixed tool name from the request
2. If `db` is configured, call `auditPreHook(context)` to capture start time and entry ID
3. If `approvalPatterns` are configured and tool name matches, call `requestApproval()` and block until resolved
4. If approval returns `"denied"` or `"timeout"`, call `auditPostHook()` with the corresponding status and return an error without calling upstream
5. If resolved and approved (or no approval needed), call `upstream.callTool(route.appName, route.originalToolName, args)`
6. If `db` is configured, call `auditPostHook()` with the result and status (success/error)
7. Return the upstream result to the runtime

For denied calls (resolve returns null): if `db` is configured, call `auditPreHook()` then immediately `auditPostHook()` with status "denied" before returning the error response.

#### Scenario: Successful tool call
- **WHEN** a runtime calls `tools/call` with name `github_create_pr` and arguments `{ title: "Fix bug" }`
- **AND** `router.resolve("github_create_pr")` returns `{ appName: "@clawmasons/app-github", originalToolName: "create_pr", ... }`
- **THEN** the proxy calls `upstream.callTool("@clawmasons/app-github", "create_pr", { title: "Fix bug" })`
- **AND** returns the upstream result to the runtime

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

#### Scenario: Tool requiring approval is approved
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** an external process approves the request during polling
- **THEN** the proxy calls `auditPreHook()`, then `requestApproval()` which returns `"approved"`
- **AND** calls `upstream.callTool()` and returns the result
- **AND** calls `auditPostHook()` with status `"success"`

#### Scenario: Tool requiring approval is denied
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** an external process denies the request during polling
- **THEN** the proxy calls `auditPreHook()`, then `requestApproval()` which returns `"denied"`
- **AND** calls `auditPostHook()` with status `"denied"`
- **AND** returns an error message without calling upstream

#### Scenario: Tool requiring approval times out
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **AND** `db` is configured
- **AND** TTL expires without resolution
- **THEN** the proxy returns `"timeout"` status
- **AND** calls `auditPostHook()` with status `"timeout"`
- **AND** returns an error message without calling upstream

#### Scenario: Tool not matching approval patterns proceeds normally
- **WHEN** a runtime calls `tools/call` with name `github_list_repos`
- **AND** `approvalPatterns` includes `"github_delete_*"`
- **THEN** no approval is requested
- **AND** the call proceeds directly to upstream

### Requirement: tools/call returns error for unknown or filtered tools
When `router.resolve(name)` returns `null` (unknown or filtered tool), the handler SHALL return a `CallToolResult` with `isError: true` and a text content message indicating the tool is unknown.

#### Scenario: Unknown tool call
- **WHEN** a runtime calls `tools/call` with name `github_delete_repo`
- **AND** `router.resolve("github_delete_repo")` returns `null`
- **THEN** the proxy returns `{ content: [{ type: "text", text: "Unknown tool: github_delete_repo" }], isError: true }`

### Requirement: tools/call returns error when upstream call fails
When the upstream `callTool()` throws an error, the handler SHALL catch the error and return a `CallToolResult` with `isError: true` and the error message as text content.

#### Scenario: Upstream error
- **WHEN** a runtime calls `tools/call` with a valid prefixed tool name
- **AND** the upstream `callTool()` throws an error with message "Connection refused"
- **THEN** the proxy returns `{ content: [{ type: "text", text: "Connection refused" }], isError: true }`

### Requirement: ForgeProxyServer graceful shutdown
The `stop()` method SHALL close the HTTP server and all active transports. It SHALL return a promise that resolves when shutdown is complete.

#### Scenario: Clean shutdown
- **WHEN** `stop()` is called on a running proxy server
- **THEN** the HTTP server stops accepting new connections
- **AND** active SSE/streamable-http transports are closed
- **AND** the promise resolves

#### Scenario: Stop when not started
- **WHEN** `stop()` is called on a server that was never started
- **THEN** the method resolves without error

### Requirement: ForgeProxyServerConfig accepts optional database and agent context
The `ForgeProxyServerConfig` interface SHALL accept an optional `db` field (a `better-sqlite3` Database instance) and an optional `agentName` field (string, defaults to `"unknown"`). When `db` is provided, audit logging is active for all tool calls.

#### Scenario: Config with database enables audit logging
- **WHEN** `ForgeProxyServer` is constructed with `{ db: <Database>, agentName: "note-taker", ... }`
- **THEN** all `tools/call` requests are audit-logged to the provided database

#### Scenario: Config without database disables audit logging
- **WHEN** `ForgeProxyServer` is constructed without a `db` field
- **THEN** `tools/call` requests proceed without audit logging

### Requirement: ForgeProxyServerConfig accepts optional approval patterns
The `ForgeProxyServerConfig` interface SHALL accept an optional `approvalPatterns` field (string[]). When `approvalPatterns` and `db` are both provided, tool calls matching any pattern require approval before execution. When either is absent, no approval checks are performed.

#### Scenario: Config with approval patterns enables approval workflow
- **WHEN** `ForgeProxyServer` is constructed with `{ approvalPatterns: ["github_delete_*"], db: <Database>, ... }`
- **THEN** tool calls matching `github_delete_*` require approval

#### Scenario: Config without approval patterns disables approval workflow
- **WHEN** `ForgeProxyServer` is constructed without `approvalPatterns`
- **THEN** no tool calls require approval
