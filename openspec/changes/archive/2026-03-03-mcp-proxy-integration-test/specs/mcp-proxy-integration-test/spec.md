## ADDED Requirements

### Requirement: Integration test installs example agent
The system SHALL provide an integration test that runs `pam install @example/agent-note-taker` against the example workspace and verifies the generated output directory contains a valid mcp-proxy config and docker-compose.yml.

#### Scenario: Install produces valid proxy config
- **WHEN** the integration test runs `node ../bin/pam.js install @example/agent-note-taker` from the example directory (after `npm run build`)
- **THEN** the output directory `.pam/agents/note-taker/` SHALL contain `mcp-proxy/config.json`, `docker-compose.yml`, and `.env`
- **AND** the `mcp-proxy/config.json` SHALL contain valid JSON with `mcpProxy` and `mcpServers` keys

### Requirement: Integration test starts mcp-proxy via Docker
The system SHALL start the mcp-proxy service using `docker compose up -d mcp-proxy` from the generated output directory and wait for it to become healthy.

#### Scenario: Proxy container starts successfully
- **WHEN** the integration test runs `docker compose up -d mcp-proxy` in the generated agent directory
- **THEN** the mcp-proxy container SHALL start and begin listening on the configured port
- **AND** the test SHALL retry health checks with exponential backoff until the proxy responds or a timeout is reached

### Requirement: Integration test verifies MCP protocol via HTTP
The system SHALL send MCP protocol requests to the running proxy endpoint and verify correct responses, simulating what an agent client would do.

#### Scenario: Tools list request returns expected tools
- **WHEN** the test sends an MCP `tools/list` request to the proxy SSE/HTTP endpoint with a valid auth token
- **THEN** the proxy SHALL respond with a list of tools that includes the filesystem tools defined in the example app (read_file, write_file, list_directory, create_directory)

#### Scenario: Tool call request executes successfully
- **WHEN** the test sends an MCP `tools/call` request for `list_directory` with path `./` to the proxy
- **THEN** the proxy SHALL execute the tool via the configured stdio server and return a valid result

#### Scenario: Unauthenticated request is rejected
- **WHEN** the test sends a request without a valid auth token
- **THEN** the proxy SHALL reject the request with an appropriate error status

### Requirement: Integration test cleans up Docker resources
The system SHALL tear down all Docker resources (containers, networks) after test completion, regardless of test pass/fail.

#### Scenario: Cleanup on success
- **WHEN** all test assertions pass
- **THEN** the test SHALL run `docker compose down` to remove all containers and networks

#### Scenario: Cleanup on failure
- **WHEN** any test assertion fails
- **THEN** the test SHALL still run `docker compose down` in a finally/afterAll block

### Requirement: Integration test retries with backoff
The system SHALL implement retry logic with backoff when connecting to the proxy, since Docker containers take time to start.

#### Scenario: Proxy not immediately available
- **WHEN** the proxy container is starting and not yet responding
- **THEN** the test SHALL retry the connection with increasing delays up to a maximum timeout (e.g., 30 seconds)
- **AND** the test SHALL fail with a clear timeout error if the proxy never becomes available
