## MODIFIED Requirements

### Requirement: Claude Code materializer generates a Dockerfile

The `generateDockerfile()` method SHALL return a Dockerfile string that:
- Uses `node:22-slim` base image
- Installs Claude Code CLI globally as root
- Creates `/home/node/.claude` directory owned by `node:node`
- Writes OOBE bypass to `/home/node/.claude.json` (not `/root/.claude.json`)
- Creates an entrypoint script at `/home/node/entrypoint.sh` that writes `CLAUDE_AUTH_TOKEN` env var content to `/home/node/.claude/.credentials.json` if set, then execs the passed command
- Sets `DISABLE_AUTOUPDATER=1`
- Switches to `USER node`
- Sets `WORKDIR /home/node/workspace`
- Copies workspace directory to `/home/node/workspace/` with `node:node` ownership
- Uses the entrypoint script as `ENTRYPOINT`
- Defaults CMD to `["claude"]`

#### Scenario: Dockerfile runs as node user
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `USER node`

#### Scenario: Dockerfile sets up Claude config in node home
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `/home/node/.claude` and `/home/node/.claude.json`
- **AND** SHALL NOT contain `/root/.claude`

#### Scenario: Dockerfile creates entrypoint for credentials
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain an entrypoint script that writes `CLAUDE_AUTH_TOKEN` to `/home/node/.claude/.credentials.json`

#### Scenario: Dockerfile workspace at /home/node/workspace
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `WORKDIR /home/node/workspace` and `COPY --chown=node:node workspace/ /home/node/workspace/`

### Requirement: Claude Code materializer generates a docker-compose service definition

The `generateComposeService()` method SHALL return a `ComposeServiceDef` with:
- `build` pointing to `./claude-code`
- `restart` set to `"no"`
- `volumes` bind-mounting workspace to `/home/node/workspace`
- `depends_on` including `mcp-proxy`
- `stdin_open` and `tty` set to `true`
- `networks` including `agent-net`
- `environment` including `CLAUDE_AUTH_TOKEN` (not `ANTHROPIC_API_KEY`) and `PAM_ROLES`
- `working_dir` set to `/home/node/workspace`

#### Scenario: Compose service uses CLAUDE_AUTH_TOKEN
- **WHEN** `generateComposeService()` is called
- **THEN** the environment SHALL contain `CLAUDE_AUTH_TOKEN=${CLAUDE_AUTH_TOKEN}` and SHALL NOT contain `ANTHROPIC_API_KEY`

#### Scenario: Compose service mounts workspace at /home/node/workspace
- **WHEN** `generateComposeService()` is called
- **THEN** volumes SHALL contain `./claude-code/workspace:/home/node/workspace` and `working_dir` SHALL be `/home/node/workspace`
