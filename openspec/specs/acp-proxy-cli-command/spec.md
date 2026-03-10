# `chapter acp-proxy` CLI Command

The `chapter acp-proxy` command is the user-facing entry point for ACP editor integration. It discovers the agent, starts the ACP bridge endpoint, orchestrates the Docker session, and connects the bridge to the container agent.

## Requirements

### Requirement: `chapter acp-proxy` command registers with correct options

The command SHALL be registered in the CLI framework with the following options.

#### Scenario: Command is available
- **GIVEN** the chapter CLI is initialized
- **WHEN** the user runs `chapter acp-proxy --help`
- **THEN** the command is listed with description containing "ACP"

#### Scenario: --role is required
- **GIVEN** the chapter CLI
- **WHEN** the user runs `chapter acp-proxy` without `--role`
- **THEN** the command fails with a missing required option error

#### Scenario: --port defaults to 3001
- **GIVEN** the chapter CLI
- **WHEN** the user runs `chapter acp-proxy --role myrole` without `--port`
- **THEN** the ACP bridge starts on port 3001

#### Scenario: --proxy-port defaults to 3000
- **GIVEN** the chapter CLI
- **WHEN** the user runs `chapter acp-proxy --role myrole` without `--proxy-port`
- **THEN** the internal proxy port is set to 3000

#### Scenario: --agent auto-detects single agent
- **GIVEN** a workspace with exactly one agent package
- **WHEN** `chapter acp-proxy --role myrole` is run without `--agent`
- **THEN** the single agent is automatically selected

#### Scenario: --agent required when multiple agents exist
- **GIVEN** a workspace with multiple agent packages
- **WHEN** `chapter acp-proxy --role myrole` is run without `--agent`
- **THEN** the command exits with error listing available agents

### Requirement: Startup sequence discovers and resolves the agent

The command SHALL discover workspace packages, resolve the agent, and compute tool filters before starting the ACP endpoint.

#### Scenario: Successful resolution
- **GIVEN** a valid chapter workspace with an agent and role
- **WHEN** `acpProxy()` is called
- **THEN** packages are discovered from the root directory
- **AND** the agent is resolved from the discovered packages
- **AND** tool filters are computed from the resolved agent

#### Scenario: No agents in workspace
- **GIVEN** a workspace with no agent packages
- **WHEN** `acpProxy()` is called
- **THEN** the command exits with code 1
- **AND** an error message indicates no agent packages were found

### Requirement: ACP bridge starts on the configured port

The command SHALL start the AcpBridge HTTP endpoint and set up lifecycle event handlers.

#### Scenario: Bridge starts
- **GIVEN** a resolved agent
- **WHEN** the ACP proxy starts
- **THEN** the bridge listens on the configured `--port` (default 3001)
- **AND** the bridge targets `localhost:3002` for the container agent

#### Scenario: Bridge lifecycle callbacks set
- **GIVEN** a started bridge
- **THEN** `onClientConnect`, `onClientDisconnect`, and `onAgentError` callbacks are configured

### Requirement: Docker session starts and bridge connects to agent

The command SHALL create an AcpSession, start Docker containers, and connect the bridge to the agent.

#### Scenario: Session starts successfully
- **GIVEN** a started bridge
- **WHEN** the Docker session is initiated
- **THEN** the AcpSession.start() is called with the project directory, agent name, role, ACP port, and proxy port
- **AND** the bridge connects to the container agent via `connectToAgent()`
- **AND** a ready message is logged with port information and session ID

#### Scenario: Session start failure
- **GIVEN** Docker compose is unavailable or Dockerfiles are missing
- **WHEN** the session fails to start
- **THEN** the command exits with code 1
- **AND** the bridge and session are cleaned up

#### Scenario: Bridge connection failure
- **GIVEN** the Docker session started but the agent is unreachable
- **WHEN** `connectToAgent()` fails
- **THEN** the command exits with code 1
- **AND** both bridge and session are stopped

### Requirement: Graceful shutdown on signals

The command SHALL handle SIGINT and SIGTERM for clean teardown.

#### Scenario: SIGINT received
- **GIVEN** a running ACP proxy with active session
- **WHEN** SIGINT is received
- **THEN** the bridge is stopped
- **AND** the session is stopped
- **AND** the process exits with code 0

#### Scenario: Client disconnect triggers teardown
- **GIVEN** a running ACP proxy with a connected client
- **WHEN** the client disconnects (bridge idle timeout)
- **THEN** the bridge is stopped
- **AND** the session is stopped
- **AND** the process exits with code 0
