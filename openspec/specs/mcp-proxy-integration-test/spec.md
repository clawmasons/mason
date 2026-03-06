# Spec: forge-proxy-integration-test

## Purpose

End-to-end integration test that validates the full native forge proxy pipeline with a real upstream MCP server: UpstreamManager → ToolRouter → ChapterProxyServer → MCP Client, including audit logging and approval workflows.

## Requirements

### Requirement: Integration test starts proxy with real upstream
The system SHALL provide a Vitest integration test (`tests/integration/chapter-proxy.test.ts`) that programmatically wires UpstreamManager, ToolRouter, and ChapterProxyServer with a real `@modelcontextprotocol/server-filesystem` upstream via stdio transport.

#### Scenario: Proxy starts and accepts MCP connections
- **WHEN** the integration test creates an UpstreamManager with the filesystem server, builds a ToolRouter from discovered tools, and starts a ChapterProxyServer
- **THEN** an MCP client SHALL be able to connect via streamable-http transport
- **AND** `tools/list` SHALL return a non-empty list of tools

### Requirement: Integration test verifies tool name prefixing and filtering
The system SHALL verify that upstream tool names are correctly prefixed with the app short name.

#### Scenario: Tools list returns prefixed filesystem tools
- **WHEN** the test calls `tools/list` through the proxy
- **THEN** all returned tool names SHALL be prefixed with `filesystem_`
- **AND** the tools SHALL include `filesystem_read_file`, `filesystem_write_file`, and `filesystem_list_directory`

### Requirement: Integration test verifies tool call forwarding
The system SHALL verify that tool calls are correctly forwarded to the upstream server and return valid results.

#### Scenario: Read file returns correct content
- **WHEN** the test calls `filesystem_read_file` with a path to a seeded test file
- **THEN** the result SHALL contain the expected file content without errors

#### Scenario: Write + read round-trip succeeds
- **WHEN** the test calls `filesystem_write_file` followed by `filesystem_read_file` on the same path
- **THEN** the read result SHALL contain the written content

#### Scenario: Unknown tool returns error
- **WHEN** the test calls a non-existent tool name
- **THEN** the result SHALL have `isError: true` with an "Unknown tool" message

### Requirement: Integration test verifies audit logging
The system SHALL verify that tool calls are logged to the SQLite audit_log table.

#### Scenario: Successful tool calls are logged
- **WHEN** the test queries the audit_log table after successful tool calls
- **THEN** entries SHALL exist with `status="success"`, correct `agent_name`, `app_name`, `tool_name`, and `duration_ms >= 0`

#### Scenario: Denied tool calls are logged
- **WHEN** the test calls an unknown tool and queries the audit_log
- **THEN** an entry SHALL exist with `status="denied"` and the attempted tool name

### Requirement: Integration test verifies approval workflow
The system SHALL verify that approval-required tools are blocked and auto-deny after TTL expiry.

#### Scenario: Approval-required tool auto-denies after TTL
- **WHEN** the test configures approval patterns matching `filesystem_write_*` with a short TTL
- **AND** calls `filesystem_write_file`
- **THEN** the call SHALL return `isError: true` with "timed out" in the message
- **AND** the audit log SHALL show `status="timeout"`
- **AND** the file SHALL NOT be written to disk

#### Scenario: Non-matching tool proceeds without approval
- **WHEN** a tool not matching approval patterns is called (e.g., `filesystem_read_file`)
- **THEN** the call SHALL proceed normally and return correct results

### Requirement: Integration test verifies clean shutdown
The system SHALL verify that the proxy server shuts down cleanly.

#### Scenario: Server stops accepting connections after shutdown
- **WHEN** a proxy server is started, used, and then stopped via `server.stop()`
- **THEN** subsequent connection attempts SHALL be rejected

### Requirement: Integration test cleans up resources
The system SHALL clean up all resources (temp directory, SQLite databases, upstream processes) after test completion.

#### Scenario: Cleanup on success or failure
- **WHEN** all tests complete (pass or fail)
- **THEN** the `afterAll` hook SHALL close the MCP client, stop the server, shutdown the upstream manager, close the database, and remove the temp directory
