# Spec: run-command

## ADDED Requirements

### Requirement: pam run command is registered as a CLI command

The CLI SHALL register a `run` command that accepts a required `<agent>` argument (agent package name), an optional `--runtime <name>` option, and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `run` command SHALL be available with argument `<agent>`, option `--runtime`, and option `--output-dir`

### Requirement: pam run resolves the agent directory

The run command SHALL resolve the agent's scaffolded directory at `.pam/agents/<short-name>/` relative to the current working directory by default. If `--output-dir` is specified, it SHALL use that path instead. The short name is derived from the agent package name by stripping the scope prefix and `agent-` prefix (matching `getAppShortName` behavior).

#### Scenario: Default agent directory resolution
- **WHEN** `pam run my-agent` is executed in a workspace where `.pam/agents/my-agent/docker-compose.yml` exists
- **THEN** the command SHALL use `.pam/agents/my-agent/` as the agent directory

#### Scenario: Custom output directory
- **WHEN** `pam run my-agent --output-dir ./custom/path` is executed
- **THEN** the command SHALL use `./custom/path` as the agent directory

#### Scenario: Agent directory not found
- **WHEN** `pam run my-agent` is executed but `.pam/agents/my-agent/` does not exist
- **THEN** the command SHALL print an error message indicating the agent is not installed and exit with code 1

#### Scenario: docker-compose.yml missing
- **WHEN** the agent directory exists but does not contain `docker-compose.yml`
- **THEN** the command SHALL print an error message indicating the agent needs to be reinstalled and exit with code 1

### Requirement: pam run validates environment variables before starting

Before delegating to Docker Compose, the run command SHALL read the `.env` file in the agent directory and validate that all required environment variables have non-empty values. Variables with empty values, or whose values are the placeholder string, SHALL cause the command to fail.

#### Scenario: All env variables filled
- **WHEN** `pam run my-agent` is executed and the `.env` file has all variables with non-empty values
- **THEN** the command SHALL proceed to start Docker Compose

#### Scenario: Missing env values
- **WHEN** `pam run my-agent` is executed and the `.env` file has variables with empty values (e.g., `GITHUB_TOKEN=`)
- **THEN** the command SHALL print an error listing the missing variables and exit with code 1

#### Scenario: No .env file
- **WHEN** `pam run my-agent` is executed and no `.env` file exists in the agent directory
- **THEN** the command SHALL print an error indicating credentials need to be configured and exit with code 1

### Requirement: pam run starts the Docker Compose stack

The run command SHALL execute `docker compose -f <agent-dir>/docker-compose.yml up -d` to start the agent stack in detached mode.

#### Scenario: Successful startup of full stack
- **WHEN** `pam run my-agent` is executed with valid configuration
- **THEN** the command SHALL execute `docker compose up -d` for the agent directory
- **AND** the command SHALL print a success message with the agent name

#### Scenario: Docker Compose failure
- **WHEN** `pam run my-agent` is executed and Docker Compose returns a non-zero exit code
- **THEN** the command SHALL exit with the same non-zero exit code

### Requirement: pam run supports --runtime flag for selective startup

When `--runtime` is specified, the run command SHALL start only the `mcp-proxy` service and the specified runtime service.

#### Scenario: Starting a specific runtime
- **WHEN** `pam run my-agent --runtime claude-code` is executed
- **THEN** the command SHALL execute `docker compose up -d mcp-proxy claude-code`

#### Scenario: Unknown runtime specified
- **WHEN** `pam run my-agent --runtime unknown-runtime` is executed
- **THEN** the command SHALL print an error indicating the runtime is not found in the compose file and exit with code 1

### Requirement: pam run checks for docker compose availability

Before attempting to start the stack, the run command SHALL verify that `docker compose` (v2) is available on the system.

#### Scenario: Docker Compose not installed
- **WHEN** `pam run my-agent` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1
