# Spec: stop-command

## ADDED Requirements

### Requirement: forge stop command is registered as a CLI command

The CLI SHALL register a `stop` command that accepts a required `<agent>` argument (agent package name) and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `stop` command SHALL be available with argument `<agent>` and option `--output-dir`

### Requirement: forge stop resolves the agent directory

The stop command SHALL resolve the agent's scaffolded directory using the same convention as the run command: `.forge/agents/<short-name>/` by default, or `--output-dir` if specified.

#### Scenario: Default agent directory resolution
- **WHEN** `forge stop my-agent` is executed in a workspace where `.forge/agents/my-agent/docker-compose.yml` exists
- **THEN** the command SHALL use `.forge/agents/my-agent/` as the agent directory

#### Scenario: Agent directory not found
- **WHEN** `forge stop my-agent` is executed but `.forge/agents/my-agent/` does not exist
- **THEN** the command SHALL print an error message indicating the agent is not installed and exit with code 1

### Requirement: forge stop tears down the Docker Compose stack

The stop command SHALL execute `docker compose -f <agent-dir>/docker-compose.yml down` to stop and remove all containers for the agent stack.

#### Scenario: Successful teardown
- **WHEN** `forge stop my-agent` is executed with an installed agent that has running containers
- **THEN** the command SHALL execute `docker compose down` for the agent directory
- **AND** the command SHALL print a success message

#### Scenario: Docker Compose failure
- **WHEN** `forge stop my-agent` is executed and Docker Compose returns a non-zero exit code
- **THEN** the command SHALL exit with the same non-zero exit code

#### Scenario: No running containers
- **WHEN** `forge stop my-agent` is executed but no containers are running
- **THEN** Docker Compose down SHALL complete without error (idempotent)

### Requirement: forge stop checks for docker compose availability

Before attempting to stop the stack, the stop command SHALL verify that `docker compose` (v2) is available on the system.

#### Scenario: Docker Compose not installed
- **WHEN** `forge stop my-agent` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1
