## MODIFIED Requirements

### Requirement: AcpSession generates a docker-compose.yml with two services

The `generateAcpComposeYml()` function SHALL produce a compose file with proxy and agent services. The compose file SHALL reference build contexts from `{projectDir}/.clawmasons/docker/{role-name}/` instead of any external docker build path.

#### Scenario: Two services are present
- **GIVEN** valid compose options with agent "claude" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the output contains services `proxy-writer` and `agent-claude-writer`
- **AND** the output does NOT contain a `credential-service` service

#### Scenario: Correct Dockerfile paths use project-local docker directory
- **GIVEN** project directory `/home/user/my-project`
- **WHEN** the compose file is generated for role "writer" with agent "claude"
- **THEN** proxy uses build context relative to `{projectDir}/.clawmasons/docker/writer/proxy/`
- **AND** agent uses build context relative to `{projectDir}/.clawmasons/docker/writer/agent/claude/`

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

### Requirement: ACP session logs written to session directory

ACP session logs SHALL be written to `{projectDir}/.clawmasons/sessions/{session-id}/logs/` instead of any role-relative or global log directory.

#### Scenario: Log file location
- **WHEN** an ACP session is running with session ID "abc12345"
- **THEN** logs SHALL be written to `{projectDir}/.clawmasons/sessions/abc12345/logs/acp.log`
- **AND** no logs SHALL be written to `~/.clawmasons/` or `roleDir/logs/`
