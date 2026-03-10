# ACP Session — Docker Session Orchestration

The ACP session manages the three-container Docker Compose session (proxy + credential-service + agent) for ACP mode, providing programmatic lifecycle management.

## Requirements

### Requirement: AcpSession generates a docker-compose.yml with three services

The `generateAcpComposeYml()` function SHALL produce a compose file with proxy, credential-service, and agent services.

#### Scenario: Three services are present
- **GIVEN** valid compose options with agent "note-taker" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the output contains services `proxy-writer`, `credential-service`, and `agent-note-taker-writer`

#### Scenario: Correct Dockerfile paths
- **GIVEN** a docker build path
- **WHEN** the compose file is generated
- **THEN** proxy uses `proxy/<role>/Dockerfile`, agent uses `agent/<agent>/<role>/Dockerfile`, credential-service uses `credential-service/Dockerfile`

### Requirement: Agent service is non-interactive in ACP mode

The agent service in ACP compose SHALL NOT have `stdin_open` or `tty` set, unlike the interactive `run-agent` compose.

#### Scenario: No interactive flags
- **GIVEN** an ACP compose file is generated
- **WHEN** the agent service section is inspected
- **THEN** it does NOT contain `stdin_open` or `tty`
- **AND** it DOES contain `init: true`

### Requirement: Agent service exposes ACP port

The agent service SHALL expose the ACP agent port to the host for bridge connectivity.

#### Scenario: Default ACP port
- **GIVEN** no custom ACP port is configured
- **WHEN** the compose file is generated
- **THEN** the agent service exposes port 3002 mapped to host port 3002

#### Scenario: Custom ACP port
- **GIVEN** `acpPort: 4444` is configured
- **WHEN** the compose file is generated
- **THEN** the agent service exposes port 4444 mapped to host port 4444

### Requirement: Credential-service receives session overrides

When credentials are provided, the credential-service SHALL receive them as a JSON-encoded `CREDENTIAL_SESSION_OVERRIDES` environment variable.

#### Scenario: Credentials provided
- **GIVEN** credentials `{ GITHUB_TOKEN: "ghp_abc" }`
- **WHEN** the compose file is generated
- **THEN** the credential-service environment contains `CREDENTIAL_SESSION_OVERRIDES` with the JSON-encoded credentials

#### Scenario: No credentials
- **GIVEN** no credentials are provided
- **WHEN** the compose file is generated
- **THEN** the credential-service environment does NOT contain `CREDENTIAL_SESSION_OVERRIDES`

#### Scenario: Empty credentials
- **GIVEN** an empty credentials object `{}`
- **WHEN** the compose file is generated
- **THEN** the credential-service environment does NOT contain `CREDENTIAL_SESSION_OVERRIDES`

### Requirement: AcpSession.start() creates and starts a Docker session

The `start()` method SHALL generate a compose file, create a session directory, and start all services in detached mode.

#### Scenario: Successful start
- **GIVEN** a valid project directory with Dockerfiles
- **WHEN** `start()` is called
- **THEN** it returns a SessionInfo with sessionId, composeFile path, acpPort, and service names
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
