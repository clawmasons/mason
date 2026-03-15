## MODIFIED Requirements

### Requirement: Config file schema validation

The `.mason/config.json` `agents` field SHALL be validated. Each entry MUST have a `package` field of type string. The optional `home` field, if present, MUST be a string. The optional `mode` field, if present, MUST be one of `"terminal"`, `"acp"`, or `"bash"`; invalid values SHALL be skipped with a warning and defaulted to `"terminal"`. The optional `role` field, if present, MUST be a string. Invalid entries (missing or non-string `package`) SHALL be skipped with a warning.

#### Scenario: Valid entry with all optional fields
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "home": "~/config", "mode": "acp", "role": "writer" }`
- **THEN** the CLI SHALL parse all fields without warning

#### Scenario: Entry missing package field
- **WHEN** `.mason/config.json` declares `"myagent": { "home": "~/config" }` (no `package`)
- **THEN** the CLI SHALL log a warning: `Invalid agent config for "myagent": missing "package" field`
- **AND** the agent SHALL be skipped

#### Scenario: Entry with invalid mode value
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "mode": "interactive" }`
- **THEN** the CLI SHALL log a warning: `Agent "myagent" has invalid mode "interactive" (expected terminal, acp, or bash). Defaulting to terminal.`
- **AND** the agent SHALL be registered with effective mode `"terminal"`

## ADDED Requirements

### Requirement: loadConfigAgentEntry returns the raw config entry for a named agent

The discovery module SHALL export a synchronous function `loadConfigAgentEntry(projectDir: string, agentName: string): AgentEntryConfig | undefined` that reads `.mason/config.json` and returns the raw config entry for the named agent, or `undefined` if the file does not exist or the agent is not declared. This function performs no dynamic imports and is safe to call before the async registry is initialised.

#### Scenario: Entry exists and is returned
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code", "role": "writer" }`
- **AND** `loadConfigAgentEntry(projectDir, "claude")` is called
- **THEN** it SHALL return `{ package: "@clawmasons/claude-code", role: "writer" }`

#### Scenario: Agent not in config returns undefined
- **WHEN** `.mason/config.json` does not declare `"unknown"`
- **AND** `loadConfigAgentEntry(projectDir, "unknown")` is called
- **THEN** it SHALL return `undefined`

#### Scenario: Config file absent returns undefined
- **WHEN** `.mason/config.json` does not exist
- **AND** `loadConfigAgentEntry(projectDir, "claude")` is called
- **THEN** it SHALL return `undefined` without throwing

### Requirement: readConfigAgentNames returns agent key names synchronously

The discovery module SHALL export a synchronous function `readConfigAgentNames(projectDir: string): string[]` that reads `.mason/config.json` and returns the list of declared agent key names. Returns an empty array if the file does not exist or cannot be parsed. This function performs no dynamic imports and is safe to call before `program.parse()`.

#### Scenario: Config with declared agents
- **WHEN** `.mason/config.json` declares agents `"claude"`, `"pi-mono-agent"`, `"mcp"`
- **AND** `readConfigAgentNames(projectDir)` is called
- **THEN** it SHALL return `["claude", "pi-mono-agent", "mcp"]` (order matches declaration order)

#### Scenario: Config file absent returns empty array
- **WHEN** `.mason/config.json` does not exist
- **AND** `readConfigAgentNames(projectDir)` is called
- **THEN** it SHALL return `[]`

#### Scenario: Malformed JSON returns empty array with warning
- **WHEN** `.mason/config.json` contains invalid JSON
- **AND** `readConfigAgentNames(projectDir)` is called
- **THEN** it SHALL return `[]`
- **AND** SHALL log a warning: `[agent-sdk] Failed to parse .mason/config.json`
