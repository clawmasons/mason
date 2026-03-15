## ADDED Requirements

### Requirement: CLI discovers built-in agent packages via static imports

The CLI SHALL discover built-in agent packages by importing them directly from its npm dependencies: `@clawmasons/claude-code`, `@clawmasons/pi-coding-agent`, `@clawmasons/mcp-agent`. These packages SHALL be listed in the CLI's `package.json` dependencies.

#### Scenario: Built-in agents are always available
- **WHEN** the CLI starts and no `.mason/config.json` exists
- **THEN** the agent registry SHALL contain `claude-code`, `pi-coding-agent`, and `mcp-agent`

#### Scenario: Built-in agent aliases are registered
- **WHEN** the CLI starts and `@clawmasons/claude-code` declares `aliases: ["claude"]`
- **THEN** both `"claude-code"` and `"claude"` SHALL resolve to the same `AgentPackage`

### Requirement: CLI discovers third-party agent packages from config

The CLI SHALL read `.mason/config.json` from the project directory (if it exists) and load agent packages declared in the `agents` field:
```json
{
  "agents": {
    "<agent-name>": {
      "package": "<npm-package-name>"
    }
  }
}
```

For each entry, the CLI SHALL attempt a dynamic `import()` of the package name and validate that the default export is a valid `AgentPackage`.

#### Scenario: Third-party agent loaded successfully
- **WHEN** `.mason/config.json` declares `"openclaw": { "package": "@clawmasons/openclaw" }`
- **AND** `@clawmasons/openclaw` is installed and exports a valid `AgentPackage`
- **THEN** the agent `"openclaw"` SHALL be available in the registry

#### Scenario: Third-party agent package not installed
- **WHEN** `.mason/config.json` declares an agent with package `"@foo/bar"` that is not installed
- **THEN** the CLI SHALL log a warning: `Agent package "@foo/bar" not found. Install it with: npm install @foo/bar`
- **AND** the CLI SHALL continue without that agent (not crash)

#### Scenario: Third-party agent package exports invalid shape
- **WHEN** `.mason/config.json` declares an agent whose package default export is not a valid `AgentPackage`
- **THEN** the CLI SHALL log a warning indicating the package does not implement the agent SDK
- **AND** the CLI SHALL continue without that agent

### Requirement: Agent registry is a Map of agent type to AgentPackage

The CLI SHALL maintain an agent registry as a `Map<string, AgentPackage>`. The registry SHALL be populated at startup with built-in agents first, then config-declared agents. Alias entries SHALL point to the same `AgentPackage` instance.

#### Scenario: Registry lookup by name
- **WHEN** `getAgent("claude-code")` is called
- **THEN** it SHALL return the `AgentPackage` with `name: "claude-code"`

#### Scenario: Registry lookup by alias
- **WHEN** `getAgent("claude")` is called
- **THEN** it SHALL return the same `AgentPackage` as `getAgent("claude-code")`

#### Scenario: Registry lookup for unknown agent
- **WHEN** `getAgent("unknown")` is called
- **THEN** it SHALL return `undefined`

### Requirement: Config-declared agents can override built-in agents

When a config-declared agent has the same name as a built-in agent, the config-declared agent SHALL take precedence. This allows users to replace built-in agent implementations.

#### Scenario: Override built-in agent
- **WHEN** `.mason/config.json` declares `"claude-code": { "package": "@custom/claude-code" }`
- **AND** `@custom/claude-code` exports a valid `AgentPackage` with `name: "claude-code"`
- **THEN** the registry SHALL use the custom package instead of the built-in `@clawmasons/claude-code`

### Requirement: getRegisteredAgentTypes returns all available agents

The discovery module SHALL export `getRegisteredAgentTypes(): string[]` that returns all agent type names (excluding aliases) from the registry.

#### Scenario: List all agent types
- **WHEN** `getRegisteredAgentTypes()` is called after startup with 3 built-in agents and 1 config agent
- **THEN** it SHALL return an array of 4 agent type names (no aliases)

### Requirement: Config file schema validation

The `.mason/config.json` `agents` field SHALL be validated. Each entry MUST have a `package` field of type string. Invalid entries SHALL be skipped with a warning.

#### Scenario: Missing package field
- **WHEN** `.mason/config.json` contains `"foo": {}` (no `package` field)
- **THEN** the CLI SHALL log a warning and skip that entry

#### Scenario: No agents field in config
- **WHEN** `.mason/config.json` exists but has no `agents` field
- **THEN** the CLI SHALL proceed with only built-in agents (no error)
