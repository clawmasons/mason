## MODIFIED Requirements

### Requirement: AgentTaskConfig defines agent task file layout

The system SHALL define an `AgentTaskConfig` interface with the following fields:
- `projectFolder: string` — folder where task files live, relative to workspace root (e.g., `".claude/commands"`, `".mason/tasks"`)
- `nameFormat: string` — file name template supporting tokens `{scopePath}`, `{scopeKebab}`, `{taskName}` (e.g., `"{scopePath}/{taskName}.md"`)
- `scopeFormat: "path" | "kebab-case-prefix"` — how scope is encoded in the file system
- `supportedFields: "all" | Array<string | FieldMapping>` — which `ResolvedTask` fields map to YAML frontmatter
- `prompt: "markdown-body"` — where the prompt content is stored in the file
- `mcpNameTemplate?: string` — optional MCP tool name template override, takes precedence over `AgentPackage.mcpNameTemplate`

#### Scenario: Config with path-based scope
- **WHEN** an `AgentTaskConfig` is defined with `scopeFormat: "path"` and `nameFormat: "{scopePath}/{taskName}.md"`
- **THEN** it SHALL be a valid config accepted by `readTasks()` and `materializeTasks()`

#### Scenario: Config with kebab-case scope
- **WHEN** an `AgentTaskConfig` is defined with `scopeFormat: "kebab-case-prefix"` and `nameFormat: "{scopeKebab}-{taskName}.md"`
- **THEN** it SHALL be a valid config accepted by `readTasks()` and `materializeTasks()`

#### Scenario: Config with mcpNameTemplate override
- **WHEN** an `AgentTaskConfig` includes `mcpNameTemplate: "custom__${server}__${tool}"`
- **THEN** task materialization SHALL use that template instead of the `AgentPackage`-level template
