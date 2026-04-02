## MODIFIED Requirements

### Requirement: Generate complete mcpProxy section
The system SHALL generate an `mcpProxy` section containing: `baseURL` (from agent proxy config or default `http://mcp-proxy:9090`), `addr` (default `:9090`), `name` (format `chapter-proxy-{agent-short-name}`), `version` (agent version), `type` (from agent proxy config or default `sse`), and `options` with `panicIfInvalid: false`, `logEnabled: true`, and `authTokens` array.

The proxy Dockerfile generation (`generateProxyDockerfile()`) SHALL NOT require a role parameter. The function SHALL accept zero arguments since the generated Dockerfile no longer contains role-specific content (the `COPY proxy-config.json` line has been removed).

#### Scenario: Default proxy settings
- **WHEN** `generateProxyConfig(agent)` is called and the agent has no `proxy` field overrides
- **THEN** the `mcpProxy` section has `addr: ":9090"`, `type: "sse"`, `logEnabled: true`, `panicIfInvalid: false`

#### Scenario: Custom proxy settings from agent
- **WHEN** the agent has `proxy: { port: 8080, type: "streamable-http" }`
- **THEN** the `mcpProxy` section has `addr: ":8080"`, `type: "streamable-http"`, and `baseURL` reflects port 8080

#### Scenario: Proxy Dockerfile generated without role
- **WHEN** `generateProxyDockerfile()` is called
- **THEN** the returned Dockerfile string SHALL NOT reference any role name and SHALL NOT contain a COPY instruction for `proxy-config.json`
