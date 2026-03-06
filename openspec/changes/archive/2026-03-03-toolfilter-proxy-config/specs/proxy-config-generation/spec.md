# proxy-config-generation Specification

## Purpose
Generate a complete tbxark/mcp-proxy `config.json` from a resolved agent, including proxy settings, all app MCP servers with toolFilter enforcement, authentication, and logging.

## Requirements

### Requirement: Generate complete mcpProxy section
The system SHALL generate an `mcpProxy` section containing: `baseURL` (from agent proxy config or default `http://mcp-proxy:9090`), `addr` (default `:9090`), `name` (format `forge-proxy-{agent-short-name}`), `version` (agent version), `type` (from agent proxy config or default `sse`), and `options` with `panicIfInvalid: false`, `logEnabled: true`, and `authTokens` array.

#### Scenario: Default proxy settings
- **WHEN** `generateProxyConfig(agent)` is called and the agent has no `proxy` field overrides
- **THEN** the `mcpProxy` section has `addr: ":9090"`, `type: "sse"`, `logEnabled: true`, `panicIfInvalid: false`

#### Scenario: Custom proxy settings from agent
- **WHEN** the agent has `proxy: { port: 8080, type: "streamable-http" }`
- **THEN** the `mcpProxy` section has `addr: ":8080"`, `type: "streamable-http"`, and `baseURL` reflects port 8080

### Requirement: Generate mcpServers entries for stdio apps
For each app using stdio transport, the system SHALL generate an `mcpServers` entry with the app's short name as key, containing `command`, `args`, `env` (with `${VAR}` interpolation preserved), and `options` with `logEnabled: true` and the computed `toolFilter`.

#### Scenario: Stdio app entry
- **WHEN** app `@clawmasons/app-github` has `transport: "stdio"`, `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]`, `env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`
- **THEN** the generated mcpServers entry for `github` contains `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]`, `env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`, and the computed `toolFilter`

### Requirement: Generate mcpServers entries for remote apps
For each app using sse or streamable-http transport, the system SHALL generate an `mcpServers` entry with the app's short name as key, containing `url` and `options` with `logEnabled: true` and the computed `toolFilter`.

#### Scenario: Remote SSE app entry
- **WHEN** app `@clawmasons/app-amap` has `transport: "sse"` and `url: "https://mcp.amap.com/sse?key=${AMAP_KEY}"`
- **THEN** the generated mcpServers entry for `amap` contains `url: "https://mcp.amap.com/sse?key=${AMAP_KEY}"` and the computed `toolFilter`

### Requirement: Generate proxy authentication token
The system SHALL generate a `FORGE_PROXY_TOKEN` using `crypto.randomUUID()` and include it in `mcpProxy.options.authTokens` as `"${FORGE_PROXY_TOKEN}"`. Callers MAY override the token via `ProxyConfigOptions.authToken`.

#### Scenario: Auto-generated token
- **WHEN** `generateProxyConfig(agent)` is called without an explicit authToken option
- **THEN** the config includes `authTokens: ["${FORGE_PROXY_TOKEN}"]` and a generated token value is available on the result

#### Scenario: Caller-provided token
- **WHEN** `generateProxyConfig(agent, { authToken: "my-custom-token" })` is called
- **THEN** the config includes the caller's token in the authTokens

### Requirement: Preserve environment variable interpolation
The generated config SHALL preserve `${VAR}` syntax in all `env` values and auth tokens. These are resolved by the mcp-proxy container at Docker runtime, not by forge at generation time.

#### Scenario: Env vars with interpolation
- **WHEN** an app has `env: { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" }`
- **THEN** the generated mcpServers entry contains the literal string `"${GITHUB_TOKEN}"` — not a resolved value

### Requirement: PRD repo-ops example compliance
The system SHALL produce output matching the structure in PRD §6.3 when given the PRD's `@clawmasons/agent-repo-ops` example agent with `role-issue-manager` and `role-pr-reviewer`.

#### Scenario: Full repo-ops config
- **WHEN** `generateProxyConfig()` is called with the PRD repo-ops agent (issue-manager allows `[create_issue, list_repos, add_label]` on github and `[send_message]` on slack; pr-reviewer allows `[list_repos, get_pr, create_review]` on github)
- **THEN** the generated config has mcpServers `github` with toolFilter list `[create_issue, list_repos, add_label, get_pr, create_review]` and mcpServers `slack` with toolFilter list `[send_message]`

### Requirement: Output type structure
The `generateProxyConfig()` function SHALL return a `ProxyConfig` object that can be serialized to JSON via `JSON.stringify()` to produce a valid tbxark/mcp-proxy config file.

#### Scenario: JSON serialization
- **WHEN** `JSON.stringify(generateProxyConfig(agent), null, 2)` is called
- **THEN** the output is valid JSON matching the tbxark/mcp-proxy config schema
