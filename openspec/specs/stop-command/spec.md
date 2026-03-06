# Spec: stop-command

## ADDED Requirements

### Requirement: chapter stop command is registered as a CLI command

The CLI SHALL register a `stop` command that accepts a required `<member>` argument (member package name) and an optional `--output-dir <dir>` option.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `stop` command SHALL be available with argument `<member>` and option `--output-dir`

### Requirement: chapter stop resolves the member directory

The stop command SHALL resolve the member's scaffolded directory using the same convention as the run command: `.chapter/members/<short-name>/` by default, or `--output-dir` if specified.

#### Scenario: Default member directory resolution
- **WHEN** `chapter stop @acme/member-ops` is executed in a workspace where `.chapter/members/ops/docker-compose.yml` exists
- **THEN** the command SHALL use `.chapter/members/ops/` as the member directory

#### Scenario: Member directory not found
- **WHEN** `chapter stop @acme/member-ops` is executed but `.chapter/members/ops/` does not exist
- **THEN** the command SHALL print an error message indicating the member is not installed and exit with code 1

### Requirement: chapter stop tears down the Docker Compose stack

The stop command SHALL execute `docker compose -f <member-dir>/docker-compose.yml down` to stop and remove all containers for the member stack.

#### Scenario: Successful teardown
- **WHEN** `chapter stop @acme/member-ops` is executed with an installed member that has running containers
- **THEN** the command SHALL execute `docker compose down` for the member directory
- **AND** the command SHALL print a success message

#### Scenario: Docker Compose failure
- **WHEN** `chapter stop @acme/member-ops` is executed and Docker Compose returns a non-zero exit code
- **THEN** the command SHALL exit with the same non-zero exit code

#### Scenario: No running containers
- **WHEN** `chapter stop @acme/member-ops` is executed but no containers are running
- **THEN** Docker Compose down SHALL complete without error (idempotent)

### Requirement: chapter stop checks for docker compose availability

Before attempting to stop the stack, the stop command SHALL verify that `docker compose` (v2) is available on the system.

#### Scenario: Docker Compose not installed
- **WHEN** `chapter stop @acme/member-ops` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1
