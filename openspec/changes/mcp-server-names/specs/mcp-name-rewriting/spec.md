## ADDED Requirements

### Requirement: convertMcpFormat rewrites MCP tool name references

The system SHALL provide a `convertMcpFormat(input: string, template: string)` utility function that replaces all occurrences of the pattern `mcp__{server}__{tool}` in the input string with the result of applying the template.

The template SHALL support `${server}` and `${tool}` placeholders. The default template SHALL be `${server}_${tool}`.

The regex pattern SHALL match `mcp__` followed by one or more non-underscore characters (the server name), followed by `__`, followed by one or more word characters (the tool name).

#### Scenario: Default template strips mcp__ prefix
- **WHEN** `convertMcpFormat("Use mcp__filesystem__read_file to read", "${server}_${tool}")` is called
- **THEN** the result SHALL be `"Use filesystem_read_file to read"`

#### Scenario: Claude Code template with mason prefix
- **WHEN** `convertMcpFormat("Use mcp__filesystem__read_file", "mcp__mason__${server}_${tool}")` is called
- **THEN** the result SHALL be `"Use mcp__mason__filesystem_read_file"`

#### Scenario: Multiple references in one string
- **WHEN** the input contains `"mcp__fs__read and mcp__fs__write"`
- **THEN** both occurrences SHALL be replaced according to the template

#### Scenario: No MCP references
- **WHEN** the input contains no `mcp__` patterns
- **THEN** the output SHALL be identical to the input

### Requirement: AgentPackage declares mcpNameTemplate

The `AgentPackage` interface SHALL include an optional `mcpNameTemplate: string` field. This field declares the MCP tool naming convention used by the agent runtime.

When `mcpNameTemplate` is not specified, the system SHALL default to `${server}_${tool}`.

#### Scenario: Claude Code agent declares its template
- **WHEN** the `claude-code-agent` package defines its `AgentPackage`
- **THEN** `mcpNameTemplate` SHALL be `"mcp__mason__${server}_${tool}"`

#### Scenario: Pi coding agent declares its template
- **WHEN** the `pi-coding-agent` package defines its `AgentPackage`
- **THEN** `mcpNameTemplate` SHALL be `"${server}_${tool}"`

#### Scenario: Agent without mcpNameTemplate uses default
- **WHEN** an `AgentPackage` omits `mcpNameTemplate`
- **THEN** the system SHALL use `"${server}_${tool}"` as the default
