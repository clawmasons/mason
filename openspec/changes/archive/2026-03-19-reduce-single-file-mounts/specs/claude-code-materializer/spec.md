## MODIFIED Requirements

### Requirement: Claude Code materializer generates settings.json with permissions only

The Claude Code materializer SHALL generate a `.claude/settings.json` file containing only a `permissions` block with `allow: ["mcp__chapter__*"]` and `deny: []`. MCP server configuration SHALL NOT be placed in `settings.json`; it is written to `.claude.json` instead.

#### Scenario: settings.json contains only permissions
- **WHEN** `materializeWorkspace` is called for any agent
- **THEN** the result SHALL contain key `.claude/settings.json` with a JSON object having only a `permissions` key
- **AND** the object SHALL NOT contain a `mcpServers` key

#### Scenario: Single chapter permission
- **WHEN** settings.json is generated for any agent
- **THEN** `permissions.allow` SHALL equal `["mcp__chapter__*"]`

### Requirement: Claude Code materializer writes MCP config into .claude.json

The Claude Code materializer SHALL write MCP server configuration into `.claude.json` at the home directory level, merging with any existing content. The `mcpServers.chapter` entry SHALL contain:
- `type` set to the agent's proxy type (`"sse"` or `"http"`)
- `url` set to `{proxyEndpoint}/sse` (for SSE) or `{proxyEndpoint}/mcp` (for streamable-http)
- `headers.Authorization` set to `"Bearer <actual-token>"` when a `proxyToken` is provided, or `"Bearer ${MCP_PROXY_TOKEN}"` as a fallback placeholder

This applies to both `materializeWorkspace` and `materializeSupervisor`.

#### Scenario: materializeWorkspace emits .claude.json with MCP config
- **WHEN** `materializeWorkspace` is called with a resolved agent using SSE proxy on port 9090
- **THEN** the result SHALL contain key `.claude.json` with a JSON object having `mcpServers.chapter.url` equal to `"http://mcp-proxy:9090/sse"` and `mcpServers.chapter.type` equal to `"sse"`

#### Scenario: materializeWorkspace does NOT emit .mcp.json
- **WHEN** `materializeWorkspace` is called
- **THEN** the result SHALL NOT contain a key `.mcp.json`

#### Scenario: Auth header with baked token in .claude.json
- **WHEN** `materializeWorkspace` is called with a `proxyToken` of `"abc123"`
- **THEN** `.claude.json` SHALL have `mcpServers.chapter.headers.Authorization` equal to `"Bearer abc123"`

#### Scenario: Auth header placeholder fallback in .claude.json
- **WHEN** `materializeWorkspace` is called without a `proxyToken`
- **THEN** `.claude.json` SHALL have `mcpServers.chapter.headers.Authorization` equal to `"Bearer ${MCP_PROXY_TOKEN}"`

### Requirement: Claude Code materializer generates a docker-compose service definition

The `generateComposeService()` method SHALL return a `ComposeServiceDef` with:
- `build` pointing to `./claude-code-agent`
- `restart` set to `"no"` (interactive containers SHALL NOT use compose-level restart; OCI restart is handled by the CLI)
- `volumes` bind-mounting workspace to `/home/node/workspace` and `.claude` directory to `/home/node/.claude`
- `depends_on` including `mcp-proxy`
- `stdin_open` and `tty` set to `true`
- `networks` including `chapter-net`
- `environment` including `CHAPTER_ROLES` only
- `working_dir` set to `/home/node/workspace`

The `.claude.json` single-file volume entry SHALL be retained as it carries OOBE bypass fields in addition to MCP config.

#### Scenario: Compose service has restart set to no
- **WHEN** `generateComposeService()` is called
- **THEN** the `restart` field SHALL equal `"no"`

#### Scenario: Compose service volumes do not include .mcp.json
- **WHEN** `generateComposeService()` is called
- **THEN** volumes SHALL NOT contain any entry mounting `.mcp.json`

#### Scenario: Compose service mounts .claude directory and .claude.json
- **WHEN** `generateComposeService()` is called
- **THEN** volumes SHALL contain `./claude-code-agent/.claude:/home/node/.claude` and `./claude-code-agent/.claude.json:/home/node/.claude.json`

## REMOVED Requirements

### Requirement: Claude Code materializer generates AGENTS.md with role documentation

**Reason**: `AGENTS.md` is a single-file workspace mount that contributes to Docker mount ordering race conditions. The file is documentation only and is not read by any runtime path; agent behaviour is fully controlled by `agent-launch.json` and role configurations.

**Migration**: Remove all calls to `generateAgentsMd()`. Remove `result.set("AGENTS.md", ...)` from `materializeWorkspace` and `materializeSupervisor`. Delete any test assertions that expect `AGENTS.md` in the materialization result.
