# Spec: run-command

## Requirements

### Requirement: chapter run command is registered as a CLI command

The CLI SHALL register a `run` command that accepts a required `--role <name>` option and an optional `--agent-type <type>` option. The `<agent-type>` positional argument is removed.

#### Scenario: Command registration
- **WHEN** the CLI program is initialized
- **THEN** the `run` command SHALL be available with option `--role` (required) and option `--agent-type` (optional)
- **AND** there SHALL be no positional `<agent-type>` argument

### Requirement: chapter run resolves project directory from cwd

The run command SHALL resolve the project directory from `process.cwd()`. It SHALL NOT read `CLAWMASONS_HOME`, `chapters.json`, `config.json`, or any global state.

#### Scenario: Project directory from cwd
- **WHEN** `chapter run --role writer` is executed from `/home/user/my-project`
- **THEN** the project directory SHALL be `/home/user/my-project`
- **AND** no reads to `~/.clawmasons/` SHALL occur

### Requirement: chapter run infers agent type from role source

The run command SHALL infer the agent type from the role's source directory (e.g., `.claude/roles/foo/` → agent type `claude`). If `--agent-type` is specified, it SHALL override the inferred type.

#### Scenario: Agent type inferred from role directory
- **WHEN** `chapter run --role writer` is executed
- **AND** the role "writer" is found at `.claude/roles/writer/ROLE.md`
- **THEN** the agent type SHALL be inferred as "claude"

#### Scenario: Agent type override
- **WHEN** `chapter run --role writer --agent-type codex` is executed
- **AND** the role "writer" is found at `.claude/roles/writer/ROLE.md`
- **THEN** the agent type SHALL be "codex" (override takes precedence)

### Requirement: chapter run uses project-local role discovery

The run command SHALL use `resolveRole(name, projectDir)` from the shared discovery module to locate the role. It SHALL NOT use `findRoleEntryByRole()` from `home.ts` or read from any global registry.

#### Scenario: Role resolved via project-local discovery
- **WHEN** `chapter run --role writer` is executed
- **THEN** the command SHALL call `resolveRole("writer", projectDir)`
- **AND** SHALL NOT call `findRoleEntryByRole()`, `readChaptersJson()`, or `getClawmasonsHome()`

#### Scenario: Role not found
- **WHEN** `chapter run --role nonexistent` is executed
- **AND** the role is not found locally or in `node_modules/`
- **THEN** the command SHALL print an error and exit with code 1

### Requirement: chapter run auto-builds docker artifacts if missing

The run command SHALL check if docker build artifacts exist at `{projectDir}/.clawmasons/docker/{role-name}/`. If they do not exist, it SHALL automatically trigger `docker-init` to materialize them before proceeding.

#### Scenario: Docker artifacts exist
- **WHEN** `chapter run --role writer` is executed
- **AND** `{projectDir}/.clawmasons/docker/writer/` contains the expected Dockerfiles
- **THEN** the command SHALL proceed directly to session creation

#### Scenario: Docker artifacts missing — auto-build
- **WHEN** `chapter run --role writer` is executed
- **AND** `{projectDir}/.clawmasons/docker/writer/` does not exist
- **THEN** the command SHALL run `docker-init` for the role before proceeding
- **AND** SHALL print a message indicating docker artifacts are being built

### Requirement: chapter run uses project-local session directory

The run command SHALL create the session at `{projectDir}/.clawmasons/sessions/{session-id}/` and generate docker-compose.yml referencing the project-local docker build directory.

#### Scenario: Session created project-locally
- **WHEN** `chapter run --role writer` is executed from `/home/user/my-project`
- **THEN** the session directory SHALL be at `/home/user/my-project/.clawmasons/sessions/{session-id}/`
- **AND** the docker-compose.yml SHALL reference `../../docker/writer/` for build contexts

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
