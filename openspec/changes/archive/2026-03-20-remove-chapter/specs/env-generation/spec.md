## MODIFIED Requirements

### Requirement: generateEnvTemplate produces a .env file string with all required variables
The system SHALL provide a `generateEnvTemplate(agent)` function that returns a string in `.env` format containing all environment variables needed by the agent stack, grouped by source with comments. Proxy-related variables SHALL use `${CLI_NAME_UPPERCASE}_` as their prefix (currently `MASON_`).

#### Scenario: Template includes proxy token
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `MASON_PROXY_TOKEN=` in the proxy section

#### Scenario: Template includes proxy port
- **WHEN** `generateEnvTemplate()` is called
- **THEN** the output SHALL include `MASON_PROXY_PORT=<default-port>` in the proxy section
