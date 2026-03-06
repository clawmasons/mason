# Spec: run-command

## ADDED Requirements

### Requirement: chapter run command is registered as a CLI command

The CLI SHALL register a `run` command that accepts a required `<member>` argument (member package name), an optional `--runtime <name>` option, and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `run` command SHALL be available with argument `<member>`, option `--runtime`, and option `--output-dir`

### Requirement: chapter run resolves the member directory

The run command SHALL resolve the member's scaffolded directory at `.chapter/members/<short-name>/` relative to the current working directory by default. If `--output-dir` is specified, it SHALL use that path instead. The short name is derived from the member package name by stripping the scope prefix and `member-` prefix (matching `getAppShortName` behavior).

#### Scenario: Default member directory resolution
- **WHEN** `chapter run @acme/member-ops` is executed in a workspace where `.chapter/members/ops/docker-compose.yml` exists
- **THEN** the command SHALL use `.chapter/members/ops/` as the member directory

#### Scenario: Custom output directory
- **WHEN** `chapter run @acme/member-ops --output-dir ./custom/path` is executed
- **THEN** the command SHALL use `./custom/path` as the member directory

#### Scenario: Member directory not found
- **WHEN** `chapter run @acme/member-ops` is executed but `.chapter/members/ops/` does not exist
- **THEN** the command SHALL print an error message indicating the member is not installed and exit with code 1

#### Scenario: docker-compose.yml missing
- **WHEN** the member directory exists but does not contain `docker-compose.yml`
- **THEN** the command SHALL print an error message indicating the member needs to be reinstalled and exit with code 1

### Requirement: chapter run validates environment variables before starting

Before delegating to Docker Compose, the run command SHALL read the `.env` file in the member directory and validate that all required environment variables have non-empty values. Variables with empty values, or whose values are the placeholder string, SHALL cause the command to fail.

#### Scenario: All env variables filled
- **WHEN** `chapter run @acme/member-ops` is executed and the `.env` file has all variables with non-empty values
- **THEN** the command SHALL proceed to start Docker Compose

#### Scenario: Missing env values
- **WHEN** `chapter run @acme/member-ops` is executed and the `.env` file has variables with empty values (e.g., `GITHUB_TOKEN=`)
- **THEN** the command SHALL print an error listing the missing variables and exit with code 1

#### Scenario: No .env file
- **WHEN** `chapter run @acme/member-ops` is executed and no `.env` file exists in the member directory
- **THEN** the command SHALL print an error indicating credentials need to be configured and exit with code 1

### Requirement: chapter run uses two-phase Docker Compose strategy

The run command SHALL use a two-phase approach to support interactive runtimes:
- **Phase 1:** `docker compose -f <compose-path> up -d mcp-proxy` (start proxy detached)
- **Phase 2:** `docker compose -f <compose-path> run --rm <runtime>` (run runtime interactively)

This allows interactive runtimes (like claude-code) to attach to stdin/stdout.

#### Scenario: Successful two-phase startup
- **WHEN** `chapter run @acme/member-ops` is executed with valid configuration and a single runtime
- **THEN** the command SHALL first execute `docker compose up -d mcp-proxy`
- **AND** then execute `docker compose run --rm <runtime>` for the auto-detected runtime
- **AND** print a session complete message when the runtime exits

#### Scenario: Docker Compose failure in proxy phase
- **WHEN** `chapter run @acme/member-ops` is executed and the proxy startup returns a non-zero exit code
- **THEN** the command SHALL exit with the same non-zero exit code without starting the runtime

#### Scenario: Docker Compose failure in runtime phase
- **WHEN** the proxy starts successfully but the runtime returns a non-zero exit code
- **THEN** the command SHALL exit with the same non-zero exit code

### Requirement: chapter run auto-detects single runtime

When `--runtime` is not specified, the run command SHALL parse the compose file to detect runtime services (all services except `mcp-proxy`). If exactly one runtime exists, it SHALL be used automatically.

#### Scenario: Single runtime auto-detected
- **WHEN** `chapter run @acme/member-ops` is executed and the compose file has only `mcp-proxy` and `claude-code` services
- **THEN** the command SHALL auto-detect `claude-code` as the runtime and proceed with two-phase startup

#### Scenario: Multiple runtimes require --runtime flag
- **WHEN** `chapter run @acme/member-ops` is executed and the compose file has `mcp-proxy`, `claude-code`, and `codex` services
- **THEN** the command SHALL print an error listing the available runtimes and suggesting `--runtime` and exit with code 1

#### Scenario: No runtime services found
- **WHEN** the compose file only contains `mcp-proxy` and no runtime services
- **THEN** the command SHALL print an error and exit with code 1

### Requirement: chapter run supports --runtime flag for selective startup

When `--runtime` is specified, the run command SHALL use the specified runtime in the two-phase startup.

#### Scenario: Starting a specific runtime
- **WHEN** `chapter run @acme/member-ops --runtime claude-code` is executed
- **THEN** the command SHALL execute phase 1 (`up -d mcp-proxy`) and phase 2 (`run --rm claude-code`)

#### Scenario: Unknown runtime specified
- **WHEN** `chapter run @acme/member-ops --runtime unknown-runtime` is executed
- **THEN** the command SHALL print an error indicating the runtime is not found in the compose file and exit with code 1

### Requirement: chapter run checks for docker compose availability

Before attempting to start the stack, the run command SHALL verify that `docker compose` (v2) is available on the system.

#### Scenario: Docker Compose not installed
- **WHEN** `chapter run @acme/member-ops` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1
