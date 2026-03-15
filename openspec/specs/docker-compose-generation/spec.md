## ADDED Requirements

### Requirement: Session compose mounts workspace directory as live bind mount

The `generateSessionComposeYml()` function SHALL accept a `workspacePath` in `SessionComposeOptions`. When provided, the agent service SHALL include a volume mount mapping the materialized workspace directory to `/home/mason/workspace/`:

```yaml
volumes:
  - {relWorkspacePath}:/home/mason/workspace
```

The path SHALL be relative from the session directory to the workspace directory (`.mason/docker/{role}/{agent}/workspace/`).

#### Scenario: Workspace directory mount included
- **WHEN** `generateSessionComposeYml()` is called with `workspacePath` pointing to `{dockerBuildDir}/{agentType}/workspace/`
- **THEN** the agent service volumes SHALL include a bind mount of that path to `/home/mason/workspace`

#### Scenario: No workspace path provided
- **WHEN** `generateSessionComposeYml()` is called without `workspacePath`
- **THEN** no `/home/mason/workspace` volume mount SHALL be added to the agent service

#### Scenario: Workspace mount coexists with project and home mounts
- **WHEN** workspace, home, and project mounts are all configured
- **THEN** the agent service SHALL have all three volume mounts: workspace at `/home/mason/workspace`, home at `/home/mason`, and project at `/home/mason/workspace/project:ro`

### Requirement: Session compose injects build/workspace/project files as per-file bind mounts

The `generateSessionComposeYml()` function SHALL accept a `buildWorkspaceProjectPath` in `SessionComposeOptions`. When provided, the function SHALL enumerate all files and immediate subdirectories within that path and emit individual bind mount entries overlaying `/home/mason/workspace/project/`:

- Each **file** found SHALL produce a bind mount: `{relFilePath}:/home/mason/workspace/project/{relativeName}`
- Each **directory** found SHALL produce a bind mount: `{relDirPath}:/home/mason/workspace/project/{relativeName}`
- All paths SHALL be relative from the session directory

This uses the same overlay mechanism as `container.ignore.paths` volume masks, but for injection rather than removal.

#### Scenario: .mcp.json injected into project directory
- **WHEN** `build/workspace/project/` contains `.mcp.json`
- **THEN** the compose volumes SHALL include a bind mount of that file to `/home/mason/workspace/project/.mcp.json`

#### Scenario: .claude directory injected into project directory
- **WHEN** `build/workspace/project/` contains a `.claude/` directory
- **THEN** the compose volumes SHALL include a bind mount of that directory to `/home/mason/workspace/project/.claude`

#### Scenario: Multiple project files all injected
- **WHEN** `build/workspace/project/` contains `.mcp.json`, `.claude/`, `AGENTS.md`, and `skills/`
- **THEN** each SHALL have a corresponding bind mount entry in the compose volumes

#### Scenario: No build/workspace/project path provided
- **WHEN** `generateSessionComposeYml()` is called without `buildWorkspaceProjectPath`
- **THEN** no per-file build overlay mounts SHALL be added to the agent service

### Requirement: Build args pass host UID/GID to agent Dockerfile

The `generateSessionComposeYml()` function SHALL include `HOST_UID` and `HOST_GID` build args in the agent service's build section:

```yaml
build:
  context: ...
  dockerfile: ...
  args:
    HOST_UID: "<host-uid>"
    HOST_GID: "<host-gid>"
```

The values SHALL be determined at build time from the host system.

#### Scenario: Build args in compose
- **WHEN** `generateSessionComposeYml()` is called with `hostUid` and `hostGid` options
- **THEN** the agent service build section SHALL include `args` with `HOST_UID` and `HOST_GID`

#### Scenario: Default UID/GID when not provided
- **WHEN** `generateSessionComposeYml()` is called without `hostUid`/`hostGid`
- **THEN** the build args SHALL default to `"1000"` for both
