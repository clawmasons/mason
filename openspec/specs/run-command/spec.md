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

The run command SHALL infer the agent type from the role's `source.agentDialect` field. If `--agent-type` is specified, it SHALL override the inferred type. Agent type resolution SHALL use the agent registry (from agent discovery) instead of the hardcoded `AGENT_TYPE_ALIASES` map.

When the user provides an agent type (via `--agent-type` or positional arg), the run command SHALL:
1. Look up the agent type in the agent registry (which includes aliases)
2. If found, use the resolved `AgentPackage`
3. If not found, print an error listing all available agent types from the registry

#### Scenario: Agent type inferred from role directory
- **WHEN** `chapter run --role writer` is executed
- **AND** the role "writer" has `source.agentDialect` of `"claude-code-agent"`
- **THEN** the agent type SHALL be resolved to `"claude-code-agent"` via the agent registry

#### Scenario: Agent type override with alias
- **WHEN** `chapter run --role writer --agent-type claude` is executed
- **THEN** the agent type SHALL resolve to `"claude-code-agent"` via the alias in the agent registry

#### Scenario: Unknown agent type error includes registry agents
- **WHEN** `chapter run --role writer --agent-type unknown` is executed
- **THEN** the error message SHALL list all agent types from `getRegisteredAgentTypes()`, including any config-declared agents

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

The run command SHALL check if docker build artifacts exist at `{projectDir}/.mason/docker/{role-name}/`. If they do not exist, it SHALL automatically trigger `generateRoleDockerBuildDir` to materialize them before proceeding.

Additionally, the run command SHALL detect when the role's `container.packages` has changed since the build directory was last generated. It SHALL compute a SHA-256 hash of the serialized `container.packages` object and compare it against a stored `.packages-hash` file in `{buildDir}/{agentType}/`. When the hash differs or the file is absent, the run command SHALL delete the stale build directory and regenerate it, then log that a stale package hash was detected.

#### Scenario: Docker artifacts exist and packages unchanged
- **WHEN** `mason run --role writer` is executed
- **AND** `{projectDir}/.mason/docker/writer/claude-code-agent/Dockerfile` exists
- **AND** the `.packages-hash` file matches the current role's `container.packages`
- **THEN** the command SHALL proceed directly to session creation without rebuilding

#### Scenario: Docker artifacts missing — auto-build
- **WHEN** `mason run --role writer` is executed
- **AND** `{projectDir}/.mason/docker/writer/` does not exist
- **THEN** the command SHALL run `generateRoleDockerBuildDir` for the role before proceeding
- **AND** SHALL print a message indicating docker artifacts are being built
- **AND** SHALL write a `.packages-hash` file to `{buildDir}/{agentType}/`

#### Scenario: Packages changed since last build — auto-invalidate
- **WHEN** `mason run --role writer` is executed
- **AND** the Dockerfile exists but `.packages-hash` does not match the current `container.packages`
- **THEN** the command SHALL delete the stale build directory
- **AND** SHALL regenerate the build artifacts including the updated Dockerfile
- **AND** SHALL log that a stale package hash was detected and rebuild was triggered
- **AND** SHALL write the updated `.packages-hash` file

#### Scenario: No packages declared — hash still written
- **WHEN** `mason run --role writer` is executed
- **AND** the role has no `container.packages` entries
- **THEN** the command SHALL write a `.packages-hash` representing the empty packages state
- **AND** subsequent runs with no changes SHALL not trigger a rebuild

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

This allows interactive runtimes (like claude-code-agent) to attach to stdin/stdout.

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
- **WHEN** `chapter run @acme/member-ops` is executed and the compose file has only `mcp-proxy` and `claude-code-agent` services
- **THEN** the command SHALL auto-detect `claude-code-agent` as the runtime and proceed with two-phase startup

#### Scenario: Multiple runtimes require --runtime flag
- **WHEN** `chapter run @acme/member-ops` is executed and the compose file has `mcp-proxy`, `claude-code-agent`, and `codex` services
- **THEN** the command SHALL print an error listing the available runtimes and suggesting `--runtime` and exit with code 1

#### Scenario: No runtime services found
- **WHEN** the compose file only contains `mcp-proxy` and no runtime services
- **THEN** the command SHALL print an error and exit with code 1

### Requirement: chapter run supports --runtime flag for selective startup

When `--runtime` is specified, the run command SHALL use the specified runtime in the two-phase startup.

#### Scenario: Starting a specific runtime
- **WHEN** `chapter run @acme/member-ops --runtime claude-code-agent` is executed
- **THEN** the command SHALL execute phase 1 (`up -d mcp-proxy`) and phase 2 (`run --rm claude-code-agent`)

#### Scenario: Unknown runtime specified
- **WHEN** `chapter run @acme/member-ops --runtime unknown-runtime` is executed
- **THEN** the command SHALL print an error indicating the runtime is not found in the compose file and exit with code 1

### Requirement: chapter run checks for docker compose availability

Before attempting to start the stack, the run command SHALL verify that `docker compose` (v2) is available on the system. After verification, it SHALL call `quickAutoCleanup(projectDir)` to silently remove stopped containers, dangling images, and orphaned session directories before proceeding with the run.

#### Scenario: Docker Compose not installed
- **WHEN** `chapter run @acme/member-ops` is executed but `docker compose` is not available
- **THEN** the command SHALL print an error indicating Docker Compose v2 is required and exit with code 1

#### Scenario: Quick auto cleanup runs before session creation
- **WHEN** `mason run --role writer` is executed
- **AND** Docker is available
- **THEN** the command SHALL call `quickAutoCleanup(projectDir)` before creating the session directory
- **AND** any stopped containers, dangling images, or orphaned sessions SHALL be silently removed

#### Scenario: Quick auto cleanup failure does not block run
- **WHEN** `mason run --role writer` is executed
- **AND** `quickAutoCleanup` encounters an error (e.g., Docker resource locked)
- **THEN** the run command SHALL log a warning and continue with session creation
- **AND** the run SHALL NOT fail due to cleanup errors

### Requirement: chapter run applies OCI-gated restart policy

The run command SHALL implement the OCI restart policy when executing the runtime phase (`docker compose run --rm <runtime>`). It SHALL capture the combined output of the invocation and delegate restart decisions to the policy: restart only on `"OCI runtime"` substring, 2s pause, max 3 attempts.

#### Scenario: OCI restart triggered by mount failure
- **WHEN** `docker compose run --rm claude-code-agent` exits non-zero
- **AND** its output contains `"OCI runtime"`
- **THEN** the run command SHALL wait 2s, print the single-file mount list and recommendation, then retry

#### Scenario: Non-OCI failure is not retried
- **WHEN** `docker compose run --rm claude-code-agent` exits non-zero
- **AND** its output does NOT contain `"OCI runtime"`
- **THEN** the run command SHALL exit immediately with the same exit code without retry
