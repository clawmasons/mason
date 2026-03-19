## ADDED Requirements

### Requirement: role.type field governs agent launch scope
The `Role` schema SHALL include a top-level `type` field with valid values `"project"` and `"supervisor"` (default: `"project"`). This field controls where role content is materialized and what working directory the agent runtime uses.

#### Scenario: type defaults to project
- **WHEN** a Role definition omits the `type` field
- **THEN** validation SHALL succeed and `role.type` SHALL equal `"project"`

#### Scenario: type supervisor is valid
- **WHEN** a Role definition sets `type: "supervisor"`
- **THEN** validation SHALL succeed and `role.type` SHALL equal `"supervisor"`

#### Scenario: invalid type is rejected
- **WHEN** a Role definition sets `type: "admin"` (an unlisted value)
- **THEN** validation SHALL fail with a schema error

### Requirement: Supervisor roles materialize content to the agent home directory
When `role.type === "supervisor"`, the `claude-code-agent` materializer SHALL route materialized files (tasks, skills, commands, and apps) to the agent home directory path prefix (`~/.claude/`) rather than the project workspace prefix (`workspace/project/.claude/`). MCP server configuration SHALL be written to `~/.claude.json` instead of the project-local settings file.

#### Scenario: Supervisor materialization writes to home
- **WHEN** `materializeForAgent` is called with a Role where `type === "supervisor"`
- **THEN** the `MaterializationResult` keys SHALL use the home prefix (e.g. `.claude/commands/`, `.claude/skills/`) rather than the project workspace prefix

#### Scenario: Project materialization is unchanged
- **WHEN** `materializeForAgent` is called with a Role where `type === "project"` (or unset)
- **THEN** the `MaterializationResult` keys SHALL use the project workspace prefix (e.g. `workspace/project/.claude/`) as before

#### Scenario: Supervisor MCP config targets home
- **WHEN** a supervisor Role includes MCP server entries
- **THEN** those entries SHALL appear in the home-level `~/.claude.json` rather than any project-local config

### Requirement: Supervisor roles set WORKDIR to workspace root in the agent Dockerfile
When `role.type === "supervisor"`, the generated agent Dockerfile SHALL use `WORKDIR /home/mason/workspace` as the final working directory. When `role.type === "project"`, the Dockerfile SHALL use `WORKDIR /home/mason/workspace/project` as before.

#### Scenario: Supervisor Dockerfile uses workspace WORKDIR
- **WHEN** an agent Dockerfile is generated for a Role with `type === "supervisor"`
- **THEN** the Dockerfile SHALL contain `WORKDIR /home/mason/workspace` as the final WORKDIR instruction

#### Scenario: Project Dockerfile is unchanged
- **WHEN** an agent Dockerfile is generated for a Role with `type === "project"` (or unset)
- **THEN** the Dockerfile SHALL contain `WORKDIR /home/mason/workspace/project` as before

#### Scenario: Agent runtime does not auto-load project config
- **WHEN** a supervisor agent container starts
- **THEN** Claude Code's working directory SHALL be `/home/mason/workspace`, so it SHALL NOT automatically load `/home/mason/workspace/project/.claude/` configuration
- **AND** the project directory SHALL still be accessible at `/home/mason/workspace/project/`

### Requirement: mason run prints role type in session summary
When `mason run` starts a session, it SHALL print the role type alongside the role name in the session summary output, unless running in ACP mode.

#### Scenario: Project role summary includes type
- **WHEN** `mason run` starts a session for a Role with `type === "project"` (or unset)
- **THEN** the summary output SHALL include a line such as `Role: <name> (project)`

#### Scenario: Supervisor role summary includes type
- **WHEN** `mason run` starts a session for a Role with `type === "supervisor"`
- **THEN** the summary output SHALL include a line such as `Role: <name> (supervisor)`

#### Scenario: ACP mode suppresses summary
- **WHEN** `mason run` starts with `--acp` flag
- **THEN** no role type summary SHALL be printed (existing ACP behavior unchanged)
