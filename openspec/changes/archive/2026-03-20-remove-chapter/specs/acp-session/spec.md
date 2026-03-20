## MODIFIED Requirements

### Requirement: AcpSession generates a docker-compose.yml with two services
The `generateAcpComposeYml()` function SHALL produce a compose file with proxy and agent services. Environment variables in the compose file SHALL use `${CLI_NAME_UPPERCASE}_` prefix (currently `MASON_`) instead of `CHAPTER_`.

#### Scenario: Proxy environment uses CLI name prefix
- **GIVEN** valid compose options with agent "claude" and role "writer"
- **WHEN** `generateAcpComposeYml()` is called
- **THEN** the proxy service environment SHALL include `MASON_PROXY_TOKEN`, `MASON_SESSION_TYPE`, and optionally `MASON_ACP_CLIENT`
- **AND** the environment SHALL NOT contain any `CHAPTER_` prefixed variables

### Requirement: MCP agent declares TEST_LLM_TOKEN credential
The initiate template's mcp agent SHALL declare `TEST_LLM_TOKEN` in its credentials array alongside existing credentials.

#### Scenario: Agent package.json includes TEST_LLM_TOKEN
- **GIVEN** the initiate template's mcp agent package.json
- **WHEN** the `mason.credentials` array is inspected (using the CLI_NAME_LOWERCASE key)
- **THEN** it contains `"TEST_LLM_TOKEN"`
