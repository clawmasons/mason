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

### Requirement: mason run supports --resume flag for session resumption

The run command SHALL accept an optional `--resume [session-id]` flag. When present, the command SHALL resume an existing session instead of creating a new one.

- `--resume` without a value: resolve via `.mason/sessions/latest` symlink
- `--resume <session-id>`: use the specified session ID directly
- `--resume latest`: equivalent to `--resume` without a value

When resuming, the command SHALL short-circuit normal agent/role resolution and instead:
1. Resolve the session ID (explicit, "latest", or symlink)
2. Read `meta.json` from `.mason/sessions/{id}/` to extract `agent`, `role`, `agentSessionId`
3. Validate the session exists, is not closed, and Docker artifacts are present
4. Warn (to stderr) if `--agent` or `--role` are also provided (they are ignored)
5. Regenerate `agent-launch.json` into the session directory with resume args injected
6. Launch Docker compose from the existing session directory
7. Update `lastUpdated` in `meta.json`

#### Scenario: Resume latest session via symlink
- **WHEN** `mason run --resume -p "add tests"` is executed
- **AND** `.mason/sessions/latest` symlink exists pointing to a valid session
- **THEN** the CLI SHALL resolve the symlink, read meta.json, and launch the session with resume args

#### Scenario: Resume specific session by ID
- **WHEN** `mason run --resume 019d2b36 -p "continue"` is executed
- **AND** `.mason/sessions/019d2b36/meta.json` exists and session is not closed
- **THEN** the CLI SHALL resume that specific session

#### Scenario: Resume with --agent flag prints warning
- **WHEN** `mason run --resume --agent claude -p "go"` is executed
- **THEN** the CLI SHALL print "Warning: --agent is ignored when resuming a session" to stderr
- **AND** SHALL use the agent from the session's meta.json

#### Scenario: Session not found shows available sessions
- **WHEN** `mason run --resume nonexistent` is executed
- **AND** no session with that ID exists
- **THEN** the CLI SHALL print an error listing available sessions with agent, role, first prompt, and relative time
- **AND** SHALL exit with non-zero status

#### Scenario: Session is closed
- **WHEN** `mason run --resume <id>` is executed
- **AND** the session's `meta.json` has `closed: true`
- **THEN** the CLI SHALL print an error and exit with non-zero status

#### Scenario: Docker image missing
- **WHEN** `mason run --resume <id>` is executed
- **AND** `docker image inspect` fails for the session's image
- **THEN** the CLI SHALL print an error and exit with non-zero status

#### Scenario: No latest session
- **WHEN** `mason run --resume` is executed
- **AND** `.mason/sessions/latest` symlink does not exist or is dangling
- **THEN** the CLI SHALL print an error and exit with non-zero status

### Requirement: mason run creates meta.json for all sessions

Every `mason run` invocation SHALL call `createSession()` from the session store to create a `meta.json` at `.mason/sessions/{uuid-v7}/`. This applies to all modes: interactive, JSON, print, dev-container, and proxy-only.

The `meta.json` SHALL contain:
- `sessionId`: UUID v7 identifier
- `masonSessionId`: identical to sessionId (for container access)
- `cwd`: project directory
- `agent`: agent type name
- `role`: role name
- `agentSessionId`: null (populated later by agent hook)
- `firstPrompt`: null (populated after first prompt)
- `lastUpdated`: ISO timestamp
- `closed`: false
- `closedAt`: null

#### Scenario: CLI session creates meta.json
- **WHEN** `mason run -p "hello"` is executed
- **THEN** `.mason/sessions/{uuid-v7}/meta.json` SHALL be created with all required fields
- **AND** `agentSessionId` SHALL be null

### Requirement: mason run maintains latest session symlink

Every session start SHALL atomically update `.mason/sessions/latest` to point to the new session directory. The symlink target SHALL be relative (just the session ID, not an absolute path).

#### Scenario: Latest symlink updated on session start
- **WHEN** `mason run -p "hello"` creates session `019d2b36`
- **THEN** `.mason/sessions/latest` SHALL be a symlink pointing to `019d2b36`

#### Scenario: Latest symlink overwritten on subsequent session
- **WHEN** a second session `019d2c00` is started
- **THEN** `.mason/sessions/latest` SHALL point to `019d2c00`, not the first session

### Requirement: mason run generates per-session agent-launch.json

The run command SHALL generate `agent-launch.json` into `.mason/sessions/{id}/` instead of the shared build directory. This enables per-session launch configuration (e.g., resume args).

The session directory is mounted into the container at `/home/mason/.mason/session/`, where `agent-entry` loads it as the primary config path.

#### Scenario: agent-launch.json written to session directory
- **WHEN** `mason run -p "hello"` creates a session
- **THEN** `agent-launch.json` SHALL be written to `.mason/sessions/{id}/agent-launch.json`

### Requirement: Resume regenerates agent-launch.json with resume args

When resuming, `refreshAgentLaunchJson()` SHALL inject the agent's resume flag and the agent session ID into the args array. If the agent's `AgentPackage` declares a `resume` config and `agentSessionId` is present in meta.json, the generated args SHALL include `[resume.flag, agentSessionId]`.

If `refreshAgentLaunchJson()` fails during resume (e.g., materialization error), it SHALL throw an error rather than silently falling back to a stale workspace copy.

#### Scenario: Resume args injected into agent-launch.json
- **WHEN** session is resumed and `agentSessionId` is `"sess_abc123"`
- **AND** the agent declares `resume: { flag: "--resume", sessionIdField: "agentSessionId" }`
- **THEN** the generated `agent-launch.json` args SHALL end with `["--resume", "sess_abc123"]`

#### Scenario: Resume args omitted when agentSessionId is null
- **WHEN** session is resumed but `agentSessionId` is null
- **THEN** the generated `agent-launch.json` SHALL NOT include any resume flag

### Requirement: Resume extracts relay token from existing compose file

When resuming, the CLI SHALL extract the `RELAY_TOKEN` from the existing `docker-compose.yaml` via regex. If extraction fails, the CLI SHALL fail with an explicit error rather than generating a new token.

#### Scenario: Relay token extracted successfully
- **WHEN** the session's `docker-compose.yaml` contains `RELAY_TOKEN=abc123def`
- **THEN** the host proxy SHALL use `abc123def` as the relay token

#### Scenario: Relay token extraction fails
- **WHEN** the session's `docker-compose.yaml` does not contain a recognizable `RELAY_TOKEN`
- **THEN** the CLI SHALL print an error and exit with non-zero status
