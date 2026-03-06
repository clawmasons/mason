# upstream-mcp-client Specification

## Purpose
Manage one MCP client connection per app in the agent's dependency graph, supporting stdio and remote (SSE/streamable-http) transports with parallel initialization, timeout handling, and forwarding of tool/resource/prompt operations to upstream MCP servers.

## Requirements

### Requirement: Parallel initialization with timeout
The system SHALL connect to all upstream MCP servers in parallel during `initialize()`. If any connection fails or the configurable timeout is exceeded, initialization SHALL throw a descriptive error naming the failed server(s).

#### Scenario: All upstreams connect successfully
- **WHEN** `initialize()` is called with 3 app configs (2 stdio, 1 remote)
- **THEN** all 3 MCP clients are connected in parallel
- **AND** the method resolves without error

#### Scenario: One upstream fails to connect
- **WHEN** `initialize()` is called and one upstream server fails to start
- **THEN** an error is thrown that names the failed server

#### Scenario: Initialization timeout
- **WHEN** `initialize(1000)` is called and an upstream takes longer than 1000ms to connect
- **THEN** an error is thrown indicating the timeout was exceeded

### Requirement: Transport selection based on app type
The system SHALL create the correct MCP transport based on `ResolvedApp.transport`: `StdioClientTransport` for `"stdio"`, `SSEClientTransport` for `"sse"`, and `StreamableHTTPClientTransport` for `"streamable-http"`.

#### Scenario: Stdio app
- **WHEN** an app has `transport: "stdio"`, `command: "node"`, `args: ["server.js"]`
- **THEN** a `StdioClientTransport` is created with the command, args, and resolved env

#### Scenario: SSE remote app
- **WHEN** an app has `transport: "sse"`, `url: "http://localhost:3000/sse"`
- **THEN** an `SSEClientTransport` is created with the URL

#### Scenario: Streamable HTTP remote app
- **WHEN** an app has `transport: "streamable-http"`, `url: "http://localhost:3000/mcp"`
- **THEN** a `StreamableHTTPClientTransport` is created with the URL

### Requirement: List tools from upstream
The system SHALL list all tools from a specific upstream app by name, handling pagination internally.

#### Scenario: List tools for a known app
- **WHEN** `getTools("@clawmasons/app-github")` is called
- **THEN** all tools from the github upstream client are returned as `Tool[]`

#### Scenario: List tools for unknown app
- **WHEN** `getTools("nonexistent")` is called
- **THEN** an error is thrown: "Unknown app: nonexistent"

### Requirement: List resources from upstream
The system SHALL list all resources from a specific upstream app by name.

#### Scenario: List resources for a known app
- **WHEN** `getResources("@clawmasons/app-github")` is called
- **THEN** all resources from the github upstream client are returned as `Resource[]`

### Requirement: List prompts from upstream
The system SHALL list all prompts from a specific upstream app by name.

#### Scenario: List prompts for a known app
- **WHEN** `getPrompts("@clawmasons/app-github")` is called
- **THEN** all prompts from the github upstream client are returned as `Prompt[]`

### Requirement: Forward tool calls
The system SHALL forward tool calls to the correct upstream app and return the result.

#### Scenario: Successful tool call
- **WHEN** `callTool("@clawmasons/app-github", "create_pr", { title: "fix" })` is called
- **THEN** `create_pr` is called on the github upstream client with the given arguments
- **AND** the `CallToolResult` is returned

#### Scenario: Tool call to unknown app
- **WHEN** `callTool("nonexistent", "some_tool", {})` is called
- **THEN** an error is thrown: "Unknown app: nonexistent"

### Requirement: Forward resource reads
The system SHALL forward resource read requests to the correct upstream app.

#### Scenario: Read resource
- **WHEN** `readResource("@clawmasons/app-github", "repo://owner/name")` is called
- **THEN** the resource is read from the github upstream client
- **AND** the `ReadResourceResult` is returned

### Requirement: Forward prompt gets
The system SHALL forward prompt get requests to the correct upstream app.

#### Scenario: Get prompt
- **WHEN** `getPrompt("@clawmasons/app-github", "pr_review", { code: "..." })` is called
- **THEN** the prompt is retrieved from the github upstream client
- **AND** the `GetPromptResult` is returned

### Requirement: Graceful shutdown
The system SHALL close all MCP client connections during `shutdown()`. Errors during individual client shutdown SHALL be caught and not prevent other clients from closing.

#### Scenario: Clean shutdown
- **WHEN** `shutdown()` is called with 3 connected clients
- **THEN** all 3 clients are closed
- **AND** the method resolves without error

#### Scenario: Shutdown with one client error
- **WHEN** `shutdown()` is called and one client throws during close
- **THEN** the other clients are still closed
- **AND** the method resolves without throwing
