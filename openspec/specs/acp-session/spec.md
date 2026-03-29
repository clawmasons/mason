# ACP Session — Docker Session Orchestration

The ACP session manages the two-container Docker Compose session (proxy + agent) for ACP mode, providing programmatic lifecycle management. The credential-service runs in-process on the host.

## Requirements

### Requirement: AcpSession generates a docker-compose.yml with two services

The `generateAcpComposeYml()` function SHALL produce a compose file with proxy and agent services. The compose file SHALL reference build contexts from `{projectDir}/.clawmasons/docker/{role-name}/` instead of any external docker build path. The credential-service SHALL NOT be included as a Docker container — it runs in-process on the host. Environment variables in the compose file SHALL use `${CLI_NAME_UPPERCASE}_` prefix (currently `MASON_`) instead of `CHAPTER_`.

#### Scenario: Two services are present
- **GIVEN** valid compose options with agent "claude" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the output contains services `proxy-writer` and `agent-claude-writer`
- **AND** the output does NOT contain a `credential-service` service

#### Scenario: Proxy environment uses CLI name prefix
- **GIVEN** valid compose options with agent "claude" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the proxy service environment SHALL include `MASON_PROXY_TOKEN`, `MASON_SESSION_TYPE`, and optionally `MASON_ACP_CLIENT`
- **AND** the environment SHALL NOT contain any `CHAPTER_` prefixed variables

#### Scenario: Agent depends on proxy
- **GIVEN** valid compose options
- **WHEN** the compose file is generated
- **THEN** the agent service `depends_on` includes the proxy service
- **AND** the agent service does NOT depend on `credential-service`

#### Scenario: Correct Dockerfile paths use project-local docker directory
- **GIVEN** project directory `/home/user/my-project`
- **WHEN** the compose file is generated for role "writer" with agent "claude"
- **THEN** proxy uses build context relative to `{projectDir}/.clawmasons/docker/writer/proxy/`
- **AND** agent uses build context relative to `{projectDir}/.clawmasons/docker/writer/agent/claude/`

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

### Requirement: AcpSession.start() uses project-local session directory

The `start()` method SHALL create the session directory at `{projectDir}/.clawmasons/sessions/{session-id}/` and write the compose file there.

#### Scenario: Successful start with project-local paths
- **GIVEN** a valid project directory at `/home/user/my-project`
- **WHEN** `start()` is called
- **THEN** the session directory SHALL be at `/home/user/my-project/.clawmasons/sessions/{session-id}/`
- **AND** the compose file SHALL be at `{session-dir}/docker/docker-compose.yml`
- **AND** `docker compose up -d` SHALL be invoked

#### Scenario: No CLAWMASONS_HOME access during start
- **WHEN** `start()` is called
- **THEN** no reads or writes to `~/.clawmasons/` SHALL occur
- **AND** all paths SHALL be relative to the project directory

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
- **WHEN** the `mason.credentials` array is inspected (using the CLI_NAME_LOWERCASE key)
- **THEN** it contains `"TEST_LLM_TOKEN"`

### Requirement: ACP session resolves project directory from session/new cwd

The ACP session SHALL use the `cwd` field from the `session/new` request as the project directory. It SHALL NOT use `CLAWMASONS_HOME` or `config.json` for path resolution.

#### Scenario: Project directory from ACP session/new
- **WHEN** an ACP `session/new` request specifies `cwd: "/home/user/my-project"`
- **THEN** the project directory SHALL be `/home/user/my-project`
- **AND** docker artifacts SHALL be resolved from `/home/user/my-project/.clawmasons/docker/`
- **AND** the session SHALL be created at `/home/user/my-project/.clawmasons/sessions/{session-id}/`

### Requirement: ACP session uses project-local role discovery

The ACP session SHALL resolve roles using `resolveRole(name, projectDir)` from the shared discovery module. This is consistent with the interactive run command.

#### Scenario: Role resolved for ACP session
- **WHEN** an ACP session is started with role "writer"
- **THEN** `resolveRole("writer", projectDir)` SHALL be called
- **AND** `findRoleEntryByRole()` and `readChaptersJson()` SHALL NOT be called

### Requirement: ACP prompt handler automatically resumes sessions

When the ACP `prompt` handler fires for an existing session, it SHALL check `meta.json` for an `agentSessionId`. If present (non-null), it SHALL pass `masonSessionId` to `executePromptStreaming()`, which spawns `mason run --resume <masonSessionId> --json <text>` instead of `mason run --agent X --role Y --json <text>`.

The `executePromptStreaming()` function SHALL accept an optional `masonSessionId` field and an optional `source` field in its options. When `masonSessionId` is set, the args SHALL be constructed as:
```
["run", "--resume", masonSessionId, "--json", text]
```

When not set, the legacy args are used:
```
["run", "--agent", agent, "--role", role, "--json", text]
```

When `source` is provided, `--source <path>` SHALL be appended to the args in either case.

#### Scenario: First prompt creates session normally
- **WHEN** the first ACP `prompt` is sent for a new session
- **AND** `meta.json` has `agentSessionId: null`
- **THEN** the handler SHALL spawn `mason run --agent X --role Y --json <text>` (no resume)

#### Scenario: Second prompt resumes after agentSessionId captured
- **WHEN** a second ACP `prompt` is sent
- **AND** `meta.json` has `agentSessionId: "sess_abc123"` (captured by SessionStart hook after first prompt)
- **THEN** the handler SHALL spawn `mason run --resume <masonSessionId> --json <text>`
- **AND** the agent SHALL resume with context from the first turn

#### Scenario: Second prompt without agentSessionId uses normal path
- **WHEN** a second ACP `prompt` is sent
- **AND** `meta.json` still has `agentSessionId: null` (hook didn't fire or failed)
- **THEN** the handler SHALL spawn `mason run --agent X --role Y --json <text>` (no resume)

#### Scenario: Source is appended when pinned
- **WHEN** source is pinned to `/abs/path/src`
- **AND** a prompt is executed (new or resumed)
- **THEN** `--source /abs/path/src` SHALL be appended to the subprocess args

### Requirement: ACP session logs written to session directory

ACP session logs SHALL be written to `{projectDir}/.clawmasons/sessions/{session-id}/logs/` instead of any role-relative or global log directory.

#### Scenario: Log file location
- **WHEN** an ACP session is running with session ID "abc12345"
- **THEN** logs SHALL be written to `{projectDir}/.clawmasons/sessions/abc12345/logs/acp.log`
- **AND** no logs SHALL be written to `~/.clawmasons/` or `roleDir/logs/`
