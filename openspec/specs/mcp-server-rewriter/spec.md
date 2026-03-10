# MCP Server Rewriter & Warning Generator

The MCP server rewriter transforms matched MCP server configs into a single chapter proxy entry for the agent container. The warning generator produces structured messages for dropped servers.

## Requirements

### Requirement: rewriteMcpConfig produces a single chapter proxy entry

The `rewriteMcpConfig()` function SHALL accept a `MatchResult`, a proxy URL, and a session token, and return a `RewriteResult` with a single `chapter` mcpServers entry and extracted credentials.

#### Scenario: Standard rewrite with matched servers
- **GIVEN** a MatchResult with 2 matched servers (github with `GITHUB_TOKEN`, slack with `SLACK_TOKEN`)
- **WHEN** `rewriteMcpConfig(matchResult, "http://proxy:3000/mcp", "token-123")` is called
- **THEN** the result has `mcpServers` with exactly one key: `"chapter"`
- **AND** `mcpServers.chapter.url` equals `"http://proxy:3000/mcp"`
- **AND** `mcpServers.chapter.headers.Authorization` equals `"Bearer token-123"`

#### Scenario: Empty matched list
- **GIVEN** a MatchResult with zero matched servers
- **WHEN** `rewriteMcpConfig(matchResult, proxyUrl, token)` is called
- **THEN** the result still has a single `chapter` entry with correct URL and auth header
- **AND** `extractedCredentials` is an empty record

### Requirement: extractCredentials collects all env vars from matched servers

The `extractCredentials()` function SHALL merge all `env` fields from matched servers into a single flat record.

#### Scenario: Multiple servers with different credentials
- **GIVEN** matched servers with `{ GITHUB_TOKEN: "ghp_abc" }` and `{ SLACK_TOKEN: "xoxb-456" }`
- **WHEN** `extractCredentials(matched)` is called
- **THEN** the result is `{ GITHUB_TOKEN: "ghp_abc", SLACK_TOKEN: "xoxb-456" }`

#### Scenario: Duplicate credential keys (last-write-wins)
- **GIVEN** two matched servers both providing `API_TOKEN` with different values
- **WHEN** `extractCredentials(matched)` is called
- **THEN** the result contains the value from the later server in the array

#### Scenario: Servers with no env fields
- **GIVEN** matched servers with no `env` properties
- **WHEN** `extractCredentials(matched)` is called
- **THEN** the result is an empty record

### Requirement: formatWarning produces PRD-format warning string

The `formatWarning()` function SHALL produce a multi-line warning string matching the PRD REQ-004 format.

#### Scenario: Standard warning format
- **GIVEN** an unmatched server named `"personal-notes"` with reason `"No matching chapter App found..."`
- **WHEN** `formatWarning(server)` is called
- **THEN** the result contains `[chapter acp-proxy] WARNING: Dropping unmatched MCP server "personal-notes"`
- **AND** the result contains `Agent will not have access to tools from this server`
- **AND** the result contains `To govern this server, create a chapter App package for it`
- **AND** the result is exactly 4 lines

### Requirement: generateWarnings maps unmatched servers to warning strings

The `generateWarnings()` function SHALL return one formatted warning per unmatched server.

#### Scenario: No unmatched servers
- **GIVEN** an empty unmatched array
- **WHEN** `generateWarnings([])` is called
- **THEN** the result is an empty array

#### Scenario: Multiple unmatched servers
- **GIVEN** 3 unmatched servers
- **WHEN** `generateWarnings(unmatched)` is called
- **THEN** the result has 3 formatted warning strings
