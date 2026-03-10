## ADDED Requirements

### Requirement: mcp-note-taker test fixture
The system SHALL provide an `@test/agent-mcp-note-taker` fixture agent that uses the `mcp-agent` runtime with `@test/role-writer` permissions and declares `TEST_TOKEN` as a credential.

#### Scenario: Fixture builds successfully
- **WHEN** `chapter build` is run in a workspace containing the `mcp-note-taker` agent
- **THEN** the build SHALL produce `docker/agent/mcp-note-taker/writer/Dockerfile` and workspace files including `.mcp.json`

### Requirement: Proxy tool pipeline e2e test
The system SHALL include an e2e test that builds the mcp-note-taker chapter, starts the proxy container, and exercises all governed filesystem tools via direct MCP client connection.

#### Scenario: List tools through governed proxy
- **WHEN** an MCP client connects to the proxy with a valid token
- **THEN** the response SHALL include filesystem tools (containing `read_file`, `write_file`, `list_directory`, `create_directory`)

#### Scenario: Call filesystem tools through governed proxy
- **WHEN** the MCP client calls `write_file` to create a note, then `read_file` to read it back
- **THEN** both calls SHALL succeed and `read_file` SHALL return the content written by `write_file`

#### Scenario: Call list_directory through governed proxy
- **WHEN** the MCP client calls `list_directory` with path `/workspace`
- **THEN** the call SHALL succeed and return directory contents

### Requirement: ACP agent mode e2e test
The system SHALL include an e2e test that starts the mcp-agent in ACP mode and exercises tool calls via acpx.

#### Scenario: Agent ACP health endpoint
- **WHEN** the agent container starts in ACP mode
- **THEN** the agent SHALL respond to health check requests on the ACP port

#### Scenario: Tool calls via ACP
- **WHEN** acpx sends tool call commands to the ACP agent endpoint
- **THEN** the agent SHALL execute the tools through the governed proxy and return results

### Requirement: acpx as test dependency
The e2e test suite SHALL use acpx (https://github.com/openclaw/acpx) as a dev dependency for ACP protocol testing.

#### Scenario: acpx available in e2e
- **WHEN** e2e tests are run
- **THEN** acpx SHALL be available as a dependency for ACP client interactions
