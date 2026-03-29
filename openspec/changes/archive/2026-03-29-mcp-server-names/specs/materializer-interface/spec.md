## MODIFIED Requirements

### Requirement: MaterializationResult is a map of relative paths to file content

The `materializeWorkspace` method SHALL return a `MaterializationResult` which is a `Map<string, string>` where keys are relative file paths (from the workspace root) and values are the file content as strings.

After materialization produces the file map, the Docker build pipeline SHALL apply `convertMcpFormat()` to the content of all task and skill files using the agent's `mcpNameTemplate` before writing them to the build directory. The template SHALL be resolved in this order:
1. `AgentTaskConfig.mcpNameTemplate` (if set)
2. `AgentPackage.mcpNameTemplate` (if set)
3. Default: `"${server}_${tool}"`

#### Scenario: Result contains workspace files
- **WHEN** `materializeWorkspace()` is called on a valid resolved agent
- **THEN** the result SHALL be a Map where each key is a relative path (e.g., `.claude/settings.json`) and each value is the string content of that file

#### Scenario: Task files have MCP names rewritten during build
- **WHEN** the Docker build pipeline writes materialized task files to the build directory
- **AND** the task content contains `mcp__filesystem__read_file`
- **AND** the agent's resolved `mcpNameTemplate` is `"mcp__mason__${server}_${tool}"`
- **THEN** the written file SHALL contain `mcp__mason__filesystem_read_file`

#### Scenario: Skill files have MCP names rewritten during build
- **WHEN** the Docker build pipeline writes materialized skill files (including SKILL.md) to the build directory
- **AND** the skill content contains MCP tool name references
- **THEN** all `mcp__{server}__{tool}` references SHALL be rewritten using the agent's resolved template

#### Scenario: Non-task non-skill files are not rewritten
- **WHEN** the Docker build pipeline writes non-task, non-skill files (e.g., settings.json, .mcp.json)
- **THEN** the content SHALL NOT be modified by `convertMcpFormat()`
