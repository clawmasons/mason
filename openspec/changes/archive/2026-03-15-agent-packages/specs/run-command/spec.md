## MODIFIED Requirements

### Requirement: chapter run infers agent type from role source

The run command SHALL infer the agent type from the role's `source.agentDialect` field. If `--agent-type` is specified, it SHALL override the inferred type. Agent type resolution SHALL use the agent registry (from agent discovery) instead of the hardcoded `AGENT_TYPE_ALIASES` map.

When the user provides an agent type (via `--agent-type` or positional arg), the run command SHALL:
1. Look up the agent type in the agent registry (which includes aliases)
2. If found, use the resolved `AgentPackage`
3. If not found, print an error listing all available agent types from the registry

#### Scenario: Agent type inferred from role directory
- **WHEN** `chapter run --role writer` is executed
- **AND** the role "writer" has `source.agentDialect` of `"claude-code"`
- **THEN** the agent type SHALL be resolved to `"claude-code"` via the agent registry

#### Scenario: Agent type override with alias
- **WHEN** `chapter run --role writer --agent-type claude` is executed
- **THEN** the agent type SHALL resolve to `"claude-code"` via the alias in the agent registry

#### Scenario: Unknown agent type error includes registry agents
- **WHEN** `chapter run --role writer --agent-type unknown` is executed
- **THEN** the error message SHALL list all agent types from `getRegisteredAgentTypes()`, including any config-declared agents
