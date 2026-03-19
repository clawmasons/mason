## ADDED Requirements

### Requirement: Agent config entry supports a credentials field

Each agent entry in `.mason/config.json` SHALL support an optional `credentials` field as an array of environment variable name strings. These credentials are merged with the agent SDK's declared `runtime.credentials` and any role-declared credentials when launching the agent.

#### Scenario: Agent entry with credentials field parsed correctly
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code-agent", "credentials": ["MY_API_KEY"] }`
- **THEN** the CLI SHALL parse the `credentials` array without error
- **AND** `credentials` SHALL be accessible as `["MY_API_KEY"]` on the resolved agent config entry

#### Scenario: Agent entry without credentials field defaults to empty
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code-agent" }`
- **THEN** `credentials` SHALL be `undefined` (treated as empty) on the resolved config entry
- **AND** no warning SHALL be emitted

#### Scenario: Non-array credentials value is ignored with warning
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "credentials": "MY_KEY" }`
- **THEN** the CLI SHALL log a warning about the invalid credentials value
- **AND** `credentials` SHALL be treated as empty for that agent

#### Scenario: Non-string array entries are skipped with warning
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "credentials": ["VALID_KEY", 123, null] }`
- **THEN** the CLI SHALL log a warning about invalid entries
- **AND** only `"VALID_KEY"` SHALL be included in the resolved credentials list

### Requirement: Agent config credentials are merged into the credential pipeline

When an agent is launched, the CLI SHALL merge credentials from three sources in order: agent SDK `runtime.credentials`, agent config `credentials`, and role `governance.credentials` plus app credentials. Duplicate keys SHALL be deduplicated — the first occurrence wins.

#### Scenario: Agent config credential appears in agent-launch.json
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code-agent", "credentials": ["EXTRA_TOKEN"] }`
- **AND** the role does not declare `EXTRA_TOKEN`
- **THEN** `agent-launch.json` SHALL include `EXTRA_TOKEN` as an env credential

#### Scenario: Duplicate credential key across agent config and role is deduplicated
- **WHEN** `.mason/config.json` declares `"claude": { "credentials": ["SHARED_KEY"] }`
- **AND** the role's `governance.credentials` also includes `"SHARED_KEY"`
- **THEN** `agent-launch.json` SHALL contain `SHARED_KEY` exactly once

#### Scenario: Duplicate credential key across SDK and agent config is deduplicated
- **WHEN** the agent SDK declares `runtime.credentials: [{ key: "CLAUDE_CODE_OAUTH_TOKEN", type: "env" }]`
- **AND** `.mason/config.json` also declares `"credentials": ["CLAUDE_CODE_OAUTH_TOKEN"]`
- **THEN** `agent-launch.json` SHALL contain `CLAUDE_CODE_OAUTH_TOKEN` exactly once

#### Scenario: Agent config credentials are passed to the container via compose
- **WHEN** `.mason/config.json` declares `"claude": { "credentials": ["MY_PROJECT_KEY"] }`
- **THEN** the generated docker-compose SHALL include `MY_PROJECT_KEY` in the credential keys passed to the container environment
