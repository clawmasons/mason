# Spec: Project-Local Session

## Purpose

Sessions are rooted in the project directory (`{projectDir}/.clawmasons/sessions/`) rather than any global directory, keeping all runtime state co-located with the project.

## Requirements

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

### Requirement: Session directory contains meta.json for all sessions

Every session — whether started via `mason run` or ACP — SHALL have a `meta.json` in its session directory. The `meta.json` SHALL contain:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | `string` | UUID v7 session identifier |
| `masonSessionId` | `string` | Identical to `sessionId`; stored for container access |
| `cwd` | `string` | Project directory |
| `agent` | `string` | Agent type name |
| `role` | `string` | Role name |
| `agentSessionId` | `string \| null` | Agent's internal session ID; populated by agent hook |
| `firstPrompt` | `string \| null` | First prompt text; set after first prompt |
| `lastUpdated` | `string` | ISO timestamp; updated on each session activity |
| `closed` | `boolean` | Whether session is closed |
| `closedAt` | `string \| null` | ISO timestamp of closure |

#### Scenario: CLI session creates meta.json
- **WHEN** `mason run -p "hello"` is executed
- **THEN** `meta.json` SHALL be created in the session directory with `agentSessionId: null`

#### Scenario: ACP session creates meta.json
- **WHEN** an ACP `session/new` request creates a session
- **THEN** `meta.json` SHALL be created with all required fields

### Requirement: Session directory contains per-session agent-launch.json

Each session SHALL have its own `agent-launch.json` in the session directory (`.mason/sessions/{id}/agent-launch.json`), enabling per-session launch customization (e.g., resume args).

The session directory is mounted into the container at `/home/mason/.mason/session/` (read-write), giving the agent access to both `meta.json` and `agent-launch.json`.

#### Scenario: Session mount in compose
- **WHEN** a session's docker-compose.yaml is generated
- **THEN** the agent service volumes SHALL include a bind mount from `.mason/sessions/{id}/` to `/home/mason/.mason/session`

### Requirement: Latest session symlink tracks most recent session

A symbolic link at `.mason/sessions/latest` SHALL point to the most recently started session directory. The symlink SHALL be updated atomically (create temp, then rename) on every session start.

#### Scenario: Symlink created on first session
- **WHEN** the first session `019d2b36` is created
- **THEN** `.mason/sessions/latest` SHALL be a relative symlink pointing to `019d2b36`

#### Scenario: Symlink updated on subsequent session
- **WHEN** a second session `019d2c00` is started
- **THEN** `.mason/sessions/latest` SHALL point to `019d2c00`

#### Scenario: Symlink missing does not block session creation
- **WHEN** symlink creation fails (e.g., filesystem issue)
- **THEN** the session SHALL still be created (symlink update is best-effort)

### Requirement: Session logs are written to the session directory

All session logs SHALL be written to `{projectDir}/.clawmasons/sessions/{session-id}/logs/` rather than any global log directory.

#### Scenario: ACP mode logs
- **WHEN** an ACP session is running
- **THEN** ACP protocol logs SHALL be written to `{session-dir}/logs/acp.log`
- **AND** no logs SHALL be written to `~/.clawmasons/`
