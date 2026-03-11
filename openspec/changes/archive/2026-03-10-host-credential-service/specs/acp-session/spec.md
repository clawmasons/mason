## MODIFIED Requirements

### Requirement: AcpSession generates a docker-compose.yml with three services

The `generateAcpComposeYml()` function SHALL produce a compose file with proxy and agent services. The credential-service SHALL NOT be included as a Docker container — it runs in-process on the host.

#### Scenario: Two services are present
- **GIVEN** valid compose options with agent "note-taker" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the output contains services `proxy-writer` and `agent-note-taker-writer`
- **AND** the output does NOT contain a `credential-service` service

#### Scenario: Agent depends on proxy
- **GIVEN** valid compose options
- **WHEN** the compose file is generated
- **THEN** the agent service `depends_on` includes the proxy service
- **AND** the agent service does NOT depend on `credential-service`

#### Scenario: Correct Dockerfile paths
- **GIVEN** a docker build path
- **WHEN** the compose file is generated
- **THEN** proxy uses `proxy/<role>/Dockerfile`, agent uses `agent/<agent>/<role>/Dockerfile`

## ADDED Requirements

### Requirement: ACP host process runs credential service in-process

The `runAcpAgent()` function SHALL start the credential service as an in-process SDK after infrastructure (proxy) is running. It SHALL connect to the proxy's WebSocket credential relay endpoint.

#### Scenario: Credential service starts after infrastructure
- **WHEN** `runAcpAgent()` starts infrastructure successfully
- **THEN** a `CredentialService` instance is created
- **AND** a `CredentialWSClient` connects to the proxy's WebSocket endpoint at `ws://localhost:<proxy-port>`
- **AND** session credential overrides are passed to the service

#### Scenario: Credential service stops on shutdown
- **WHEN** the ACP host process receives SIGTERM
- **THEN** the credential WSClient connection is closed
- **AND** the credential service is stopped

### Requirement: E2E test verifies credential resolution from host

The e2e test SHALL verify that credentials declared by an agent can be resolved from the host environment through the full chain: host env → credential service (in-process) → proxy relay → agent.

#### Scenario: Credential request returns host environment value
- **GIVEN** `TEST_LLM_TOKEN` is set in the host process environment
- **AND** the mcp agent declares `TEST_LLM_TOKEN` in its credentials
- **WHEN** the agent calls the `credential_request` MCP tool for `TEST_LLM_TOKEN`
- **THEN** the response contains the value from the host environment

### Requirement: MCP agent declares TEST_LLM_TOKEN credential

The initiate template's mcp agent SHALL declare `TEST_LLM_TOKEN` in its credentials array alongside existing credentials.

#### Scenario: Agent package.json includes TEST_LLM_TOKEN
- **GIVEN** the initiate template's mcp agent package.json
- **WHEN** the `chapter.credentials` array is inspected
- **THEN** it contains `"TEST_LLM_TOKEN"`
