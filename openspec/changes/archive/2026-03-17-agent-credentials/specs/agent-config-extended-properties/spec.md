## MODIFIED Requirements

### Requirement: Agent config entry supports home, mode, and role properties

Each agent entry in `.mason/config.json` SHALL support four optional launch-profile properties in addition to the existing `package` field: `home` (string), `mode` (one of `"terminal"`, `"acp"`, `"bash"`), `role` (string), and `credentials` (array of strings). These properties define per-agent invocation defaults for the current project.

#### Scenario: Agent entry with all optional properties
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code", "home": "~/projects/claude-config", "mode": "terminal", "role": "writer", "credentials": ["MY_KEY"] }`
- **THEN** the CLI SHALL parse all five fields without error
- **AND** `home`, `mode`, `role`, and `credentials` SHALL be accessible when launching the `claude` agent

#### Scenario: Agent entry with only package (backward compatible)
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code" }`
- **THEN** the CLI SHALL parse the entry without error
- **AND** `home`, `mode`, `role`, and `credentials` SHALL all be `undefined`

#### Scenario: Invalid mode value is rejected with warning
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "mode": "interactive" }`
- **THEN** the CLI SHALL log a warning: `Agent "myagent" has invalid mode "interactive" (expected terminal, acp, or bash). Defaulting to terminal.`
- **AND** the agent SHALL still be registered, using `"terminal"` as its effective mode
