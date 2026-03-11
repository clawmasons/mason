# ACP Session — Docker Session Orchestration

The ACP session manages the two-container Docker Compose session (proxy + agent) for ACP mode, providing programmatic lifecycle management. The credential-service runs in-process on the host.

## Requirements

### Requirement: AcpSession generates a docker-compose.yml with two services

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

### Requirement: Agent service is non-interactive in ACP mode

The agent service in ACP compose SHALL NOT have `stdin_open` or `tty` set, unlike the interactive `run-agent` compose.

#### Scenario: No interactive flags
- **GIVEN** an ACP compose file is generated
- **WHEN** the agent service section is inspected
- **THEN** it does NOT contain `stdin_open` or `tty`
- **AND** it DOES contain `init: true`

### Requirement: Agent service does NOT expose ACP ports

The agent service SHALL NOT expose any ACP ports to the host. Communication occurs via piped stdio from `docker compose run`, not HTTP.

#### Scenario: No ports section for agent
- **GIVEN** any ACP compose configuration
- **WHEN** the compose file is generated
- **THEN** the agent service does NOT contain a `ports` section

### Requirement: AcpSession.start() creates and starts a Docker session

The `start()` method SHALL generate a compose file, create a session directory, and start all services in detached mode.

#### Scenario: Successful start
- **GIVEN** a valid project directory with Dockerfiles
- **WHEN** `start()` is called
- **THEN** it returns a SessionInfo with sessionId, composeFile path, and service names
- **AND** the compose file exists on disk
- **AND** `docker compose up -d` was invoked

#### Scenario: Start fails when already running
- **GIVEN** a session that has been started
- **WHEN** `start()` is called again
- **THEN** it throws an error containing "already running"

#### Scenario: Start fails when compose up fails
- **GIVEN** docker compose up returns a non-zero exit code
- **WHEN** `start()` is called
- **THEN** it throws an error containing "Failed to start ACP session"

### Requirement: AcpSession.stop() tears down containers

The `stop()` method SHALL run `docker compose down` and mark the session as not running.

#### Scenario: Successful stop
- **GIVEN** a running session
- **WHEN** `stop()` is called
- **THEN** `docker compose down` is invoked
- **AND** `isRunning()` returns false

#### Scenario: Stop is idempotent
- **GIVEN** a session that is not running
- **WHEN** `stop()` is called
- **THEN** no compose commands are invoked
- **AND** the call completes without error

### Requirement: AcpSession.isRunning() reports state

#### Scenario: Initial state
- **GIVEN** a newly constructed AcpSession
- **THEN** `isRunning()` returns false

#### Scenario: After start
- **GIVEN** a session that has been started
- **THEN** `isRunning()` returns true

#### Scenario: After stop
- **GIVEN** a session that has been started then stopped
- **THEN** `isRunning()` returns false

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
