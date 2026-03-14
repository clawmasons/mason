## ADDED Requirements

### Requirement: Session directory is rooted in the project

Each run-agent invocation SHALL create a session directory at `{projectDir}/.clawmasons/sessions/{session-id}/` where `session-id` is a generated unique identifier.

#### Scenario: Interactive mode session creation
- **WHEN** `run-agent --role writer` is executed in `/home/user/my-project`
- **THEN** a directory SHALL be created at `/home/user/my-project/.clawmasons/sessions/{session-id}/`
- **AND** the directory SHALL contain a `docker/` subdirectory for the compose file
- **AND** the directory SHALL contain a `logs/` subdirectory

#### Scenario: ACP mode session creation
- **WHEN** an ACP `session/new` request specifies cwd `/home/user/my-project`
- **THEN** the session directory SHALL be created at `/home/user/my-project/.clawmasons/sessions/{session-id}/`

### Requirement: Docker-compose.yml references project-local docker build directory

The generated `docker-compose.yml` SHALL reference Dockerfiles from `{projectDir}/.clawmasons/docker/{role-name}/` as the build context, not from any external or global path.

#### Scenario: Compose file build contexts
- **WHEN** a session docker-compose.yml is generated for role "writer" with agent "claude"
- **THEN** the proxy service build context SHALL be `../../docker/writer/proxy/`
- **AND** the agent service build context SHALL be `../../docker/writer/agent/claude/`

### Requirement: Docker-compose mounts the project directory

The docker-compose.yml SHALL mount the project directory into the agent container so the agent can read and write project files.

#### Scenario: Project directory is mounted
- **WHEN** the session compose file is generated for project `/home/user/my-project`
- **THEN** the agent service SHALL have a volume mount from `/home/user/my-project` into the container's workspace directory

### Requirement: Session logs are written to the session directory

All session logs SHALL be written to `{projectDir}/.clawmasons/sessions/{session-id}/logs/` rather than any global log directory.

#### Scenario: ACP mode logs
- **WHEN** an ACP session is running
- **THEN** ACP protocol logs SHALL be written to `{session-dir}/logs/acp.log`
- **AND** no logs SHALL be written to `~/.clawmasons/`
