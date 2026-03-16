## ADDED Requirements

### Requirement: Build process routes supervisor role files to home build directory
When `generateRoleDockerBuildDir` processes a Role with `type === "supervisor"`, the materialized workspace files (tasks, skills, commands, apps) SHALL be written to `{agentDir}/build/home/` rather than `{agentDir}/build/workspace/project/`. The Docker compose volume configuration SHALL mount `{agentDir}/build/home/` into `/home/mason/` in the container.

#### Scenario: Supervisor materialization routes to home build dir
- **WHEN** `generateRoleDockerBuildDir` is called for a Role with `type === "supervisor"`
- **THEN** the materialized files SHALL be placed under `{agentDir}/build/home/` (e.g. `{agentDir}/build/home/.claude/commands/`)

#### Scenario: Supervisor compose mounts home build dir
- **WHEN** the docker-compose service is generated for a supervisor role
- **THEN** the volume mount SHALL bind `{agentDir}/build/home/` to `/home/mason/` in the container

#### Scenario: Project role routing is unchanged
- **WHEN** `generateRoleDockerBuildDir` is called for a Role with `type === "project"` (or unset)
- **THEN** materialized files SHALL continue to be placed under `{agentDir}/build/workspace/project/` as before

### Requirement: Claude Code materializer switches file prefix for supervisor roles
The `claude-code` materializer's `materializeWorkspace` method SHALL check `role.type` when generating the `MaterializationResult` map keys. For supervisor roles, the path prefix SHALL be home-relative (e.g. `.claude/commands/`). For project roles, the prefix SHALL remain workspace-project-relative (e.g. `.claude/commands/` under the project root, ultimately mounted at `workspace/project/.claude/commands/`).

#### Scenario: Supervisor keys use home prefix
- **WHEN** `materializeWorkspace` is called with a supervisor Role containing tasks and skills
- **THEN** result keys SHALL be prefixed for home placement (e.g. `.claude/commands/my-task.md`)

#### Scenario: Project keys use workspace prefix
- **WHEN** `materializeWorkspace` is called with a project Role containing tasks and skills
- **THEN** result keys SHALL be prefixed for project workspace placement as before
