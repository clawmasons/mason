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

### Requirement: Session compose mounts session directory into agent container

The `generateSessionComposeYml()` function SHALL include a bind mount from the session directory to `/home/mason/.mason/session` (read-write) in the agent service. This mount provides the agent access to:
- `agent-launch.json` — per-session launch configuration
- `meta.json` — session metadata (agent hooks write `agentSessionId` here)

```yaml
volumes:
  - {relSessionDir}:/home/mason/.mason/session
```

The path SHALL be relative from the session directory.

#### Scenario: Session directory mount included
- **WHEN** `generateSessionComposeYml()` is called with a `sessionDir`
- **THEN** the agent service volumes SHALL include a bind mount to `/home/mason/.mason/session`

#### Scenario: Session mount coexists with other mounts
- **WHEN** workspace, home, project, and session mounts are all configured
- **THEN** the agent service SHALL have all volume mounts including the session mount at `/home/mason/.mason/session`

### Requirement: Proxy service binds to random localhost port

The `generateSessionComposeYml()` function SHALL generate the proxy service port mapping as `"127.0.0.1::9090"` (empty host port, localhost only). This delegates host port assignment to Docker, eliminating port conflicts between concurrent sessions.

The proxy service SHALL NOT accept a `proxyPort` parameter for the host-side port mapping. The container-internal port SHALL remain `9090`.

The proxy service SHALL mount the role-specific `proxy-config.json` into the container as a read-only bind mount at `/app/proxy-config.json`:

```yaml
proxy-{roleName}:
  image: mason-{projectHash}-proxy
  volumes:
    - {relDockerDir}/{roleName}/mcp-proxy/proxy-config.json:/app/proxy-config.json:ro
  ports:
    - "127.0.0.1::9090"
```

The volume mount path on the host side SHALL be relative from the session directory to the per-role config file at `.mason/docker/{roleName}/mcp-proxy/proxy-config.json`.

#### Scenario: Random port mapping in generated compose YAML
- **WHEN** `generateSessionComposeYml()` generates the proxy service definition
- **THEN** the `ports` section SHALL contain `"127.0.0.1::9090"` with no fixed host port

#### Scenario: Localhost-only binding
- **WHEN** the proxy service port mapping is generated
- **THEN** the mapping SHALL bind to `127.0.0.1` only, not to all interfaces

#### Scenario: proxyPort option removed from compose generation
- **WHEN** `generateSessionComposeYml()` is called
- **THEN** the function SHALL NOT accept or use a `proxyPort` option for the host port mapping

#### Scenario: Proxy config mounted as read-only volume
- **WHEN** `generateSessionComposeYml()` generates the proxy service definition for role "writer"
- **THEN** the proxy service volumes SHALL include a bind mount from `{relDockerDir}/writer/mcp-proxy/proxy-config.json` to `/app/proxy-config.json:ro`

#### Scenario: Proxy config mount uses per-role path
- **WHEN** a project has roles "writer" and "reviewer"
- **THEN** the "writer" proxy service SHALL mount `{relDockerDir}/writer/mcp-proxy/proxy-config.json` and the "reviewer" proxy service SHALL mount `{relDockerDir}/reviewer/mcp-proxy/proxy-config.json`

### Requirement: Proxy port discovery after container startup

A `discoverProxyPort()` function SHALL exist that runs `docker compose -f <composeFile> port <proxyServiceName> 9090` and returns the assigned host port as a number.

The function SHALL parse the output format `<host>:<port>` (e.g., `127.0.0.1:55123`) and extract the port number.

The function SHALL throw a descriptive error if the command fails or returns unexpected output.

#### Scenario: Successful port discovery
- **WHEN** `discoverProxyPort()` is called after `docker compose up -d` completes
- **THEN** it SHALL execute `docker compose port <service> 9090` and return the assigned host port as a number

#### Scenario: Parse docker compose port output
- **WHEN** `docker compose port` returns `127.0.0.1:55123`
- **THEN** `discoverProxyPort()` SHALL return `55123`

#### Scenario: Port discovery failure
- **WHEN** `docker compose port` fails or returns empty/malformed output
- **THEN** `discoverProxyPort()` SHALL throw an error with a message indicating the proxy port could not be determined

### Requirement: Session compose uses stable image names without session ID

The generated Docker Compose YAML SHALL use image tags scoped to project + role + agent, NOT to session ID. The image name format SHALL be `mason-{projectHash}-{agentServiceName}-{agentShortName}` (or `mason-{projectHash}-{agentServiceName}` when no agent short name applies). Multiple sessions of the same role within the same project SHALL reuse the same image tag.

The proxy service image name SHALL be `mason-{projectHash}-proxy` (no role suffix), since the proxy image is shared across all roles.

#### Scenario: Image tag does not contain session ID
- **WHEN** a session compose YAML is generated
- **THEN** the `image:` field for agent services does NOT contain the session ID

#### Scenario: Same role produces same image tag across sessions
- **WHEN** two sessions are created for the same role in the same project
- **THEN** both sessions' compose files reference the same image tag

#### Scenario: Different roles produce different image tags
- **WHEN** two sessions are created for different roles in the same project
- **THEN** each session's compose file references a distinct agent image tag but the SAME proxy image tag

#### Scenario: Proxy image tag has no role suffix
- **WHEN** a session compose YAML is generated for role "writer" in project with hash `abcd1234`
- **THEN** the proxy service `image:` field SHALL be `mason-abcd1234-proxy` (not `mason-abcd1234-proxy-writer`)

#### Scenario: Different projects produce different image tags
- **WHEN** sessions are created for the same role in different projects
- **THEN** the image tags differ due to different projectHash values
