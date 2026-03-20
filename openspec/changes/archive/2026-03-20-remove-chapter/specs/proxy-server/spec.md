## MODIFIED Requirements

### Requirement: ProxyServer creates an MCP server named after the CLI
The `ProxyServer` class SHALL create an MCP `Server` instance with `name: CLI_NAME_LOWERCASE` (currently `"mason"`) and `version: "0.1.0"`. The server SHALL declare the `tools` capability.

#### Scenario: Server identity
- **WHEN** a runtime connects to the proxy server
- **THEN** the MCP server identifies itself as `{ name: "mason", version: "0.1.0" }`

### Requirement: ProxyServer starts an HTTP server on configurable port
The `ProxyServer` SHALL start a `node:http` server on the port specified in its configuration. The `start()` method SHALL return a promise that resolves when the server is listening. The default port SHALL be 9090.

#### Scenario: Start on default port
- **WHEN** `ProxyServer` is constructed with no port specified and `start()` is called
- **THEN** the HTTP server listens on port 9090

#### Scenario: Start on custom port
- **WHEN** `ProxyServer` is constructed with `port: 3000` and `start()` is called
- **THEN** the HTTP server listens on port 3000

### Requirement: ProxyServer supports SSE transport
When configured with `transport: "sse"`, the server SHALL handle:
- `GET /sse` — create a new `SSEServerTransport`, connect a new `Server` instance, and start the SSE stream
- `POST /messages` — forward the message body to the active `SSEServerTransport`

#### Scenario: SSE connection and tool listing
- **WHEN** a client connects via `GET /sse` and sends a `tools/list` request via `POST /messages`
- **THEN** the server returns the prefixed, filtered tool list from the `ToolRouter`

### Requirement: ProxyServer supports streamable-http transport
When configured with `transport: "streamable-http"`, the server SHALL route all requests to `StreamableHTTPServerTransport.handleRequest()` for the MCP endpoint path.

#### Scenario: Streamable-http connection and tool listing
- **WHEN** a client connects via streamable-http and sends a `tools/list` request
- **THEN** the server returns the prefixed, filtered tool list from the `ToolRouter`

### Requirement: ProxyServer graceful shutdown
The `stop()` method SHALL close the HTTP server and all active transports. It SHALL return a promise that resolves when shutdown is complete.

#### Scenario: Clean shutdown
- **WHEN** `stop()` is called on a running proxy server
- **THEN** the HTTP server stops accepting new connections
- **AND** active SSE/streamable-http transports are closed
- **AND** the promise resolves

#### Scenario: Stop when not started
- **WHEN** `stop()` is called on a server that was never started
- **THEN** the method resolves without error

### Requirement: ProxyServerConfig accepts optional database and agent context
The `ProxyServerConfig` interface SHALL accept an optional `db` field (a `better-sqlite3` Database instance) and an optional `agentName` field (string, defaults to `"unknown"`). When `db` is provided, audit logging is active for all tool calls.

#### Scenario: Config with database enables audit logging
- **WHEN** `ProxyServer` is constructed with `{ db: <Database>, agentName: "note-taker", ... }`
- **THEN** all `tools/call` requests are audit-logged to the provided database

#### Scenario: Config without database disables audit logging
- **WHEN** `ProxyServer` is constructed without a `db` field
- **THEN** `tools/call` requests proceed without audit logging

### Requirement: ProxyServerConfig accepts optional approval patterns
The `ProxyServerConfig` interface SHALL accept an optional `approvalPatterns` field (string[]). When `approvalPatterns` and `db` are both provided, tool calls matching any pattern require approval before execution.

#### Scenario: Config with approval patterns enables approval workflow
- **WHEN** `ProxyServer` is constructed with `{ approvalPatterns: ["github_delete_*"], db: <Database>, ... }`
- **THEN** tool calls matching `github_delete_*` require approval

#### Scenario: Config without approval patterns disables approval workflow
- **WHEN** `ProxyServer` is constructed without `approvalPatterns`
- **THEN** no tool calls require approval

### Requirement: ProxyServer exposes a /health endpoint
The `ProxyServer` SHALL handle `GET /health` without authentication. When the server is ready and the project filesystem is accessible, it SHALL respond `200 OK` with body `"ok"`. When `PROJECT_DIR` is set but the directory is not yet accessible, it SHALL respond `503 Service Unavailable` with body `"filesystem not ready"`.

#### Scenario: Healthy response
- **WHEN** `GET /health` is called and `PROJECT_DIR` is not set
- **THEN** the server responds `200 OK` with body `"ok"`

#### Scenario: Filesystem not ready
- **WHEN** `GET /health` is called and `PROJECT_DIR` is set to a path that does not yet exist
- **THEN** the server responds `503 Service Unavailable` with body `"filesystem not ready"`

## RENAMED Requirements

### Requirement: Class and interface rename
FROM: `ChapterProxyServer`, `ChapterProxyServerConfig`
TO: `ProxyServer`, `ProxyServerConfig`

### Requirement: File rename
FROM: `integration-chapter-proxy.test.ts`
TO: `integration-proxy.test.ts`
