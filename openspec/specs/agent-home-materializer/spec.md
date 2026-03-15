## ADDED Requirements

### Requirement: RuntimeMaterializer interface includes optional materializeHome method

The `RuntimeMaterializer` interface SHALL include an optional method `materializeHome(projectDir: string, homePath: string): void` that materializes host configuration into the agent's home directory at `homePath`. The method writes directly to disk (not via `Map<string, string>`) because it copies directory trees and binary files.

#### Scenario: Materializer without materializeHome
- **WHEN** a `RuntimeMaterializer` does not implement `materializeHome`
- **THEN** the build process SHALL skip home materialization for that agent type

#### Scenario: Materializer with materializeHome
- **WHEN** a `RuntimeMaterializer` implements `materializeHome`
- **THEN** the build process SHALL call it with the project directory and the target home path at `{projectDir}/.mason/docker/{role}/{agent}/home/`

### Requirement: Claude Code materializer copies host claude config to agent home

The claude-code materializer SHALL implement `materializeHome(projectDir, homePath)` that copies the following from the host user's home directory into `homePath/.claude/`:
- `~/.claude/statsig/` (recursive)
- `~/.claude/projects/` (recursive, with path transformation)
- `~/.claude/settings.json`
- `~/.claude/stats-cache.json`
- `~/.claude/plans/` (recursive)
- `~/.claude/plugins/` (recursive)
- `~/.claude/skills/` (recursive)
- `~/.claude.json` → `homePath/.claude.json`

Each source path that does not exist on the host SHALL be silently skipped.

#### Scenario: All host config exists
- **WHEN** `materializeHome` is called and all source paths exist on the host
- **THEN** all listed files and directories SHALL be copied to the corresponding paths under `homePath`

#### Scenario: Missing host config is skipped
- **WHEN** `materializeHome` is called and `~/.claude/plugins/` does not exist
- **THEN** the method SHALL skip that path without error and copy all other existing paths

#### Scenario: Home directory is created if missing
- **WHEN** `materializeHome` is called and `homePath` does not exist
- **THEN** it SHALL create `homePath` and all necessary subdirectories recursively

### Requirement: Claude Code materializer transforms projects directory paths

When copying `~/.claude/projects/`, the materializer SHALL:
1. Take the current `projectDir` and replace all `/` characters with `-` to produce `{flattenedPath}`
2. Copy the entire `~/.claude/projects/` directory to `homePath/.claude/projects/`
3. Delete all subdirectories in `homePath/.claude/projects/` except the one matching `{flattenedPath}`
4. Rename the matching directory to `-home-mason-workspace-project`

This ensures Claude Code in the container finds project context at the path corresponding to `/home/mason/workspace/project`.

#### Scenario: Project directory path transformation
- **WHEN** `projectDir` is `/Users/greff/Projects/clawmasons/chapter`
- **THEN** the flattened path is `-Users-greff-Projects-clawmasons-chapter`
- **AND** only that directory is kept under `homePath/.claude/projects/`
- **AND** it is renamed to `-home-mason-workspace-project`

#### Scenario: No matching project directory
- **WHEN** `~/.claude/projects/` exists but contains no directory matching the flattened project path
- **THEN** the materializer SHALL create an empty `homePath/.claude/projects/-home-mason-workspace-project/` directory

#### Scenario: Multiple project directories filtered
- **WHEN** `~/.claude/projects/` contains directories for 5 different projects
- **THEN** only the directory matching the current project SHALL be kept; the other 4 SHALL be deleted

### Requirement: Build process invokes materializeHome during docker build directory generation

The `generateRoleDockerBuildDir` function SHALL call the materializer's `materializeHome(projectDir, homePath)` method (if implemented) during build directory generation. The `homePath` SHALL be `{buildDir}/{agentType}/home/`.

#### Scenario: Build generates home directory
- **WHEN** `generateRoleDockerBuildDir` is called for a claude-code agent
- **THEN** it SHALL call `materializeHome` and produce a `home/` directory alongside `workspace/` under the agent type directory

#### Scenario: Build skips home for materializers without materializeHome
- **WHEN** `generateRoleDockerBuildDir` is called for an mcp-agent (which does not implement `materializeHome`)
- **THEN** no `home/` directory SHALL be created
