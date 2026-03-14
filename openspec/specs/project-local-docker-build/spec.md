# Spec: Project-Local Docker Build

## Purpose

Docker build artifacts are materialized to a project-local directory (`{projectDir}/.clawmasons/docker/`) so that all docker contexts are self-contained within the project, eliminating dependency on global paths.

## Requirements

### Requirement: Docker build artifacts are materialized to project-local directory

The `docker-init` command SHALL write all docker build artifacts to `{projectDir}/.clawmasons/docker/{role-name}/` instead of `{chapterProject}/docker/`. The directory structure SHALL contain `agent/{agent-type}/`, `proxy/`, and `credential-service/` subdirectories.

#### Scenario: Materialize agent docker artifacts for a claude role
- **WHEN** `docker-init` is run for role "writer" with agent type "claude"
- **THEN** the following files SHALL exist:
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/agent/claude/workspace/project/.claude/` (materialized role files)
  - `{projectDir}/.clawmasons/docker/writer/proxy/Dockerfile`
  - `{projectDir}/.clawmasons/docker/writer/proxy/config.json`
  - `{projectDir}/.clawmasons/docker/writer/credential-service/Dockerfile`

#### Scenario: Materialize role with different agent type override
- **WHEN** `docker-init` is run for role "writer" (defined in `.claude/roles/`) with `--agent-type codex`
- **THEN** the agent subdirectory SHALL be `agent/codex/` not `agent/claude/`
- **AND** the workspace files SHALL still be materialized from the `.claude` role definition

### Requirement: Materializer receives full RoleType with resolved dependencies

The `materializeForAgent()` caller SHALL resolve the complete role dependency graph (tools, skills, commands) and pass the full `RoleType` to the materializer. The materializer SHALL NOT perform its own role discovery.

#### Scenario: Role with skill dependencies
- **WHEN** role "writer" depends on skills "grammar-check" and "tone-adjust"
- **THEN** the materialized workspace SHALL include the skill files from both dependencies
- **AND** the materializer SHALL not call `discoverRoles()` or `resolveRole()`

### Requirement: Workspace files are copied during materialization

The materializer SHALL copy role files (CLAUDE.md, settings.json, skills/, commands/) into the workspace directory under the agent's project path structure.

#### Scenario: Role files copied to workspace
- **WHEN** a role with CLAUDE.md, settings.json, and skills/ is materialized
- **THEN** the workspace SHALL contain:
  - `workspace/project/.claude/CLAUDE.md`
  - `workspace/project/.claude/settings.json`
  - `workspace/project/.claude/skills/` (with skill files)

### Requirement: Dockerfile installs role packages at build time

The generated agent Dockerfile SHALL include `npm install` commands to install all role-declared packages during the Docker build step, not at runtime.

#### Scenario: Role declares npm dependencies
- **WHEN** a role specifies packages `["eslint", "@acme/lint-rules"]`
- **THEN** the generated Dockerfile SHALL contain a build step that runs `npm install eslint @acme/lint-rules`

### Requirement: Docker build directory is gitignored

The `docker-init` command SHALL ensure `{projectDir}/.clawmasons/docker/` is listed in `.clawmasons/.gitignore`. The docker build artifacts are generated and SHALL NOT be tracked in version control.

#### Scenario: Gitignore is created or updated
- **WHEN** `docker-init` materializes docker artifacts
- **THEN** `.clawmasons/.gitignore` SHALL contain a line matching `docker/`
