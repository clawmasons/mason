## Purpose

Defines the `AgentTaskConfig` interface that declares how an agent stores task files in the workspace. This config drives both `readTasks()` and `materializeTasks()`, enabling cross-agent task portability.

## Requirements

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

### Requirement: supportedFields controls frontmatter mapping

The `supportedFields` property SHALL control which `ResolvedTask` properties are written to/read from YAML frontmatter:
- `"all"` — write all properties except `name`, `prompt`, and `scope` (name/scope are derived from filename/path, prompt is in the body)
- Array of strings — only the listed fields (e.g., `["description", "category", "tags"]`)
- Array with `->` mapping syntax — the frontmatter key differs from the `ResolvedTask` property name (e.g., `"name->displayName"` means frontmatter key is `name`, mapped to `displayName` on `ResolvedTask`)

Fields not listed in `supportedFields` SHALL be silently dropped during write. During read, only fields present in frontmatter SHALL be populated on the `ResolvedTask`.

#### Scenario: supportedFields "all" writes all metadata fields
- **WHEN** `supportedFields` is `"all"` and a task has `displayName`, `description`, `category`, `tags`, and `version`
- **THEN** all those fields SHALL appear in the YAML frontmatter
- **AND** `name`, `prompt`, and `scope` SHALL NOT appear in frontmatter

#### Scenario: supportedFields array limits written fields
- **WHEN** `supportedFields` is `["description"]` and a task has `displayName`, `description`, `category`, and `tags`
- **THEN** only `description` SHALL appear in the YAML frontmatter

#### Scenario: supportedFields with mapping syntax
- **WHEN** `supportedFields` includes `"name->displayName"`
- **AND** a task has `displayName: "Fix Bug"`
- **THEN** the frontmatter SHALL contain `name: Fix Bug`
- **AND** when reading, the frontmatter key `name` SHALL be mapped to `displayName` on the `ResolvedTask`

### Requirement: name is always derived from filename

The task `name` SHALL always be derived from the filename, never from frontmatter. If frontmatter contains a field that maps to `name` (e.g., via `"name->displayName"` in `supportedFields`), it SHALL be read as `displayName` on the `ResolvedTask`.

#### Scenario: name derived from filename with path scope
- **WHEN** reading a file at `projectFolder/ops/triage/fix-bug.md` with `scopeFormat: "path"`
- **THEN** `name` SHALL be `"fix-bug"`
- **AND** `scope` SHALL be `"ops:triage"`

#### Scenario: name derived from filename with kebab scope
- **WHEN** reading a file at `projectFolder/ops-triage-fix-bug.md` with `scopeFormat: "kebab-case-prefix"` for a known task named `"fix-bug"`
- **THEN** `name` SHALL be `"fix-bug"`
- **AND** `scope` SHALL be `"ops:triage"`

#### Scenario: frontmatter name maps to displayName
- **WHEN** reading a file `fix-bug.md` with frontmatter `name: "Fix Bug"` and `supportedFields` includes `"name->displayName"`
- **THEN** `name` SHALL be `"fix-bug"` (from filename)
- **AND** `displayName` SHALL be `"Fix Bug"` (from frontmatter)

### Requirement: No-scope tasks placed in projectFolder root

Tasks with empty scope (`""`) SHALL be placed directly in `projectFolder` with no scope prefix or subdirectory.

#### Scenario: No-scope task with path format
- **WHEN** writing a task with `scope: ""` and `scopeFormat: "path"` and `nameFormat: "{scopePath}/{taskName}.md"`
- **THEN** the file SHALL be written to `projectFolder/taskName.md` (no leading slash or subdirectory)

#### Scenario: No-scope task with kebab format
- **WHEN** writing a task with `scope: ""` and `scopeFormat: "kebab-case-prefix"` and `nameFormat: "{scopeKebab}-{taskName}.md"`
- **THEN** the file SHALL be written to `projectFolder/taskName.md` (no leading dash)

#### Scenario: Reading no-scope task with path format
- **WHEN** reading a file directly in `projectFolder` (not in a subdirectory) with `scopeFormat: "path"`
- **THEN** `scope` SHALL be `""`

### Requirement: Scope is colon-delimited on ResolvedTask

The `scope` property on `ResolvedTask` SHALL be a colon-delimited string (e.g., `"ops:triage"`). An empty string represents no scope.

When writing:
- For `scopeFormat: "path"`, scope `"ops:triage"` SHALL be converted to directory path `ops/triage/`
- For `scopeFormat: "kebab-case-prefix"`, scope `"ops:triage"` SHALL be converted to filename prefix `ops-triage-`

When reading:
- For `scopeFormat: "path"`, directory path `ops/triage/` relative to `projectFolder` SHALL be converted to scope `"ops:triage"`
- For `scopeFormat: "kebab-case-prefix"`, filename prefix before the known task name SHALL be converted to scope (strip trailing `-`, replace `-` with `:`)

#### Scenario: Write scope as path
- **WHEN** writing a task with `scope: "ops:triage"` and `scopeFormat: "path"`
- **THEN** the `{scopePath}` token SHALL resolve to `"ops/triage"`

#### Scenario: Write scope as kebab prefix
- **WHEN** writing a task with `scope: "ops:triage"` and `scopeFormat: "kebab-case-prefix"`
- **THEN** the `{scopeKebab}` token SHALL resolve to `"ops-triage"`

#### Scenario: Read scope from kebab filename with known task name
- **WHEN** reading file `ops-triage-fix-bug.md` and the known task name is `"fix-bug"`
- **THEN** scope SHALL be `"ops:triage"` (everything before `-fix-bug.md`, with `-` replaced by `:`)
