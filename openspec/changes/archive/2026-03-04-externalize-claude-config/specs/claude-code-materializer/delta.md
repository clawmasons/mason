## MODIFIED Requirements

### Requirement: Claude Code materializer generates a Dockerfile

The `generateDockerfile()` method SHALL return a Dockerfile string that:
- Uses `node:22-slim` base image
- Installs Claude Code CLI globally as root
- Sets `DISABLE_AUTOUPDATER=1`
- Switches to `USER node`
- Sets `WORKDIR /home/node/workspace`
- Copies workspace directory to `/home/node/workspace/` with `node:node` ownership
- Defaults CMD to `["claude", "--dangerously-skip-permissions"]`

The Dockerfile SHALL NOT:
- Create `.claude.json` (this is now a host-mounted volume)
- Create `/home/node/.claude` directory (this is now a host-mounted volume)
- Create an entrypoint script for credential injection
- Reference `CLAUDE_AUTH_TOKEN`
- Use an `ENTRYPOINT` directive

#### Scenario: Dockerfile runs as node user
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `USER node`

#### Scenario: Dockerfile does not create Claude config
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL NOT contain `.claude.json`, `mkdir -p /home/node/.claude`, `chown`, or `entrypoint`

#### Scenario: Dockerfile does not handle credentials
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL NOT contain `CLAUDE_AUTH_TOKEN`, `.credentials.json`, or `ENTRYPOINT`

#### Scenario: Dockerfile workspace at /home/node/workspace
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `WORKDIR /home/node/workspace` and `COPY --chown=node:node workspace/ /home/node/workspace/`

#### Scenario: Dockerfile disables auto-updater
- **WHEN** `generateDockerfile()` is called
- **THEN** the result SHALL contain `ENV DISABLE_AUTOUPDATER=1`

#### Scenario: Dockerfile bypasses permission prompts
- **WHEN** `generateDockerfile()` is called
- **THEN** the CMD SHALL include `--dangerously-skip-permissions`

### Requirement: Claude Code materializer generates a docker-compose service definition

The `generateComposeService()` method SHALL return a `ComposeServiceDef` with:
- `build` pointing to `./claude-code`
- `restart` set to `"no"`
- `volumes` bind-mounting workspace to `/home/node/workspace`, `.claude` directory to `/home/node/.claude`, and `.claude.json` to `/home/node/.claude.json`
- `depends_on` including `mcp-proxy`
- `stdin_open` and `tty` set to `true`
- `networks` including `agent-net`
- `environment` including `PAM_ROLES` only (no `CLAUDE_AUTH_TOKEN`)
- `working_dir` set to `/home/node/workspace`

#### Scenario: Compose service mounts .claude directory and .claude.json
- **WHEN** `generateComposeService()` is called
- **THEN** volumes SHALL contain `./claude-code/.claude:/home/node/.claude`, `./claude-code/.claude.json:/home/node/.claude.json`, and `./claude-code/workspace:/home/node/workspace`

#### Scenario: Compose service does not include CLAUDE_AUTH_TOKEN
- **WHEN** `generateComposeService()` is called
- **THEN** the environment SHALL NOT contain `CLAUDE_AUTH_TOKEN`

#### Scenario: Compose service has correct structure
- **WHEN** `generateComposeService()` is called with an agent having roles `issue-manager` and `pr-reviewer`
- **THEN** the result SHALL have `environment` containing `PAM_ROLES=issue-manager,pr-reviewer` and `depends_on` containing `mcp-proxy`

## NEW Requirements

### Requirement: Claude Code materializer generates .claude.json content

The materializer SHALL provide a `generateClaudeJson()` method that returns the JSON string for the OOBE bypass file:
```json
{
  "hasCompletedOnboarding": true,
  "projects": {
    "/home/node/workspace": {
      "hasTrustDialogAccepted": true
    }
  }
}
```

#### Scenario: generateClaudeJson returns valid OOBE bypass
- **WHEN** `generateClaudeJson()` is called
- **THEN** the result SHALL be valid JSON containing `hasCompletedOnboarding: true` and `hasTrustDialogAccepted: true` for `/home/node/workspace`
