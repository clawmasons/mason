## Purpose

Provides `readTasks()` and `materializeTasks()` functions that read/write task files from/to the filesystem using an `AgentTaskConfig`. Enables cross-agent task portability by abstracting file layout conventions.

## Requirements

### Requirement: readTasks reads task files from an agent's folder

The system SHALL provide a `readTasks(config: AgentTaskConfig, projectDir: string): ResolvedTask[]` function that:
1. Discovers `.md` files in `path.join(projectDir, config.projectFolder)`
2. Parses YAML frontmatter and markdown body from each file
3. Derives `name` from the filename (never from frontmatter)
4. Derives `scope` from the file path or filename prefix based on `config.scopeFormat`
5. Maps frontmatter fields to `ResolvedTask` properties based on `config.supportedFields`
6. Reads the prompt from the markdown body (when `config.prompt` is `"markdown-body"`)
7. Returns `ResolvedTask[]`

This function remains available for bulk operations (cross-agent portability, round-trip tests) but is no longer the primary mechanism for resolving task content from ROLE.md references. The primary resolution path is `readTask()` (singular) from the `scoped-command-resolution` capability.

#### Scenario: Read tasks with path scope format
- **WHEN** `readTasks` is called with `scopeFormat: "path"` and `projectFolder: ".claude/commands"`
- **AND** the folder contains `fix-bug.md` and `ops/triage/label-issue.md`
- **THEN** it SHALL return two `ResolvedTask` objects:
  - `{ name: "fix-bug", scope: "", prompt: <body of fix-bug.md> }`
  - `{ name: "label-issue", scope: "ops:triage", prompt: <body of label-issue.md> }`

#### Scenario: Read tasks with kebab scope format
- **WHEN** `readTasks` is called with `scopeFormat: "kebab-case-prefix"` and `projectFolder: ".mason/tasks"`
- **AND** the folder contains `fix-bug.md` and `ops-triage-label-issue.md`
- **THEN** it SHALL return two `ResolvedTask` objects:
  - `{ name: "fix-bug", scope: "", ... }`
  - `{ name: "label-issue", scope: "ops:triage", ... }`

#### Scenario: Read frontmatter with field mapping
- **WHEN** `readTasks` is called with `supportedFields: ["name->displayName", "description", "tags"]`
- **AND** a task file has frontmatter `name: "Fix Bug"`, `description: "Fixes bugs"`, `tags: ["ops"]`
- **THEN** the `ResolvedTask` SHALL have `displayName: "Fix Bug"`, `description: "Fixes bugs"`, `tags: ["ops"]`
- **AND** `name` SHALL be derived from the filename, not from the frontmatter `name` field

#### Scenario: Read prompt from markdown body
- **WHEN** `readTasks` is called with `prompt: "markdown-body"`
- **AND** a task file has YAML frontmatter followed by markdown content
- **THEN** the `ResolvedTask.prompt` SHALL contain the markdown body (everything after the frontmatter closing `---`)

#### Scenario: Empty projectFolder returns empty array
- **WHEN** `readTasks` is called and `projectFolder` does not exist or contains no `.md` files
- **THEN** it SHALL return an empty array

### Requirement: readTasks discovers files based on scope format

When `scopeFormat` is `"path"`, `readTasks` SHALL walk subdirectories recursively to discover task files. When `scopeFormat` is `"kebab-case-prefix"`, `readTasks` SHALL list `.md` files in the flat `projectFolder` directory only (no recursion).

#### Scenario: Path format walks subdirectories
- **WHEN** `readTasks` is called with `scopeFormat: "path"`
- **AND** `projectFolder` contains `a.md`, `sub/b.md`, and `sub/deep/c.md`
- **THEN** all three files SHALL be discovered and returned as tasks

#### Scenario: Kebab format reads flat directory only
- **WHEN** `readTasks` is called with `scopeFormat: "kebab-case-prefix"`
- **AND** `projectFolder` contains `a.md` and a subdirectory `sub/` with `b.md`
- **THEN** only `a.md` SHALL be discovered (subdirectories are not traversed)

### Requirement: materializeTasks writes task files from ResolvedTask array

The system SHALL provide a `materializeTasks(tasks: ResolvedTask[], config: AgentTaskConfig): MaterializationResult` function that:
1. For each task, resolves the file path by replacing tokens in `config.nameFormat`:
   - `{taskName}` → `task.name`
   - `{scopePath}` → scope converted to path segments (e.g., `"ops:triage"` → `"ops/triage"`)
   - `{scopeKebab}` → scope converted to kebab prefix (e.g., `"ops:triage"` → `"ops-triage"`)
2. Prepends `config.projectFolder` to the resolved path
3. Builds YAML frontmatter from `config.supportedFields`
4. Places `task.prompt` as the markdown body
5. Returns a `MaterializationResult` (`Map<string, string>`) of relative paths → file content

#### Scenario: Write task with path scope
- **WHEN** `materializeTasks` is called with a task `{ name: "fix-bug", scope: "ops:triage", prompt: "Fix the bug" }` and `nameFormat: "{scopePath}/{taskName}.md"`, `projectFolder: ".claude/commands"`
- **THEN** the result SHALL contain key `".claude/commands/ops/triage/fix-bug.md"`
- **AND** the value SHALL be a markdown file with YAML frontmatter (per supportedFields) and body `"Fix the bug"`

#### Scenario: Write task with kebab scope
- **WHEN** `materializeTasks` is called with a task `{ name: "fix-bug", scope: "ops:triage", prompt: "Fix the bug" }` and `nameFormat: "{scopeKebab}-{taskName}.md"`, `projectFolder: ".mason/tasks"`
- **THEN** the result SHALL contain key `".mason/tasks/ops-triage-fix-bug.md"`

#### Scenario: Write task with no scope
- **WHEN** `materializeTasks` is called with a task `{ name: "fix-bug", scope: "", prompt: "Fix the bug" }` and `nameFormat: "{scopePath}/{taskName}.md"`, `projectFolder: ".claude/commands"`
- **THEN** the result SHALL contain key `".claude/commands/fix-bug.md"` (no leading slash or empty directory)

#### Scenario: Write task with supportedFields filtering
- **WHEN** `materializeTasks` is called with `supportedFields: ["description"]` and a task has `displayName`, `description`, `category`, and `tags`
- **THEN** the generated frontmatter SHALL only contain `description`

#### Scenario: Write task with field mapping
- **WHEN** `materializeTasks` is called with `supportedFields: ["name->displayName", "description"]` and a task has `displayName: "Fix Bug"` and `description: "Fixes bugs"`
- **THEN** the generated frontmatter SHALL contain `name: Fix Bug` and `description: Fixes bugs`

#### Scenario: Write task with no frontmatter fields
- **WHEN** `materializeTasks` is called with `supportedFields: []` (empty array) and a task has a prompt
- **THEN** the generated file SHALL contain only the prompt as markdown body with no frontmatter

### Requirement: readTasks and materializeTasks are symmetric

Reading tasks written by `materializeTasks` using the same `AgentTaskConfig` SHALL produce `ResolvedTask` objects equivalent to the originals (for fields supported by the config).

#### Scenario: Round-trip preserves task data
- **GIVEN** a `ResolvedTask` with `name: "fix-bug"`, `scope: "ops:triage"`, `description: "Fixes bugs"`, `prompt: "Fix the bug"`
- **AND** an `AgentTaskConfig` with `supportedFields: ["description"]`
- **WHEN** `materializeTasks([task], config)` writes the file
- **AND** `readTasks(config, projectDir)` reads it back
- **THEN** the resulting task SHALL have `name: "fix-bug"`, `scope: "ops:triage"`, `description: "Fixes bugs"`, `prompt: "Fix the bug"`

#### Scenario: Cross-agent portability
- **GIVEN** tasks read from a Claude Code agent folder using its `AgentTaskConfig`
- **WHEN** those tasks are written using a Pi agent's `AgentTaskConfig`
- **THEN** the files SHALL be placed in the Pi agent's `projectFolder` with the Pi agent's naming convention
- **AND** only fields in the Pi agent's `supportedFields` SHALL appear in frontmatter

### Requirement: Mason canonical task config uses path scope format

The Mason dialect's canonical `AgentTaskConfig` SHALL use `scopeFormat: "path"` and `nameFormat: "{scopePath}/{taskName}.md"` with `projectFolder: ".mason/tasks"`. Scoped tasks SHALL be stored in nested directories (e.g., `.mason/tasks/opsx/apply.md`), not as flat kebab-prefixed files.

#### Scenario: Mason config uses path format
- **WHEN** the Mason canonical task config is used
- **THEN** `scopeFormat` SHALL be `"path"`
- **AND** `nameFormat` SHALL be `"{scopePath}/{taskName}.md"`
- **AND** `projectFolder` SHALL be `".mason/tasks"`

#### Scenario: Scoped task resolves to nested directory
- **WHEN** `readTask` is called with the Mason config, `name: "apply"`, `scope: "opsx"`
- **THEN** it SHALL read from `.mason/tasks/opsx/apply.md`

#### Scenario: Unscoped task resolves to root
- **WHEN** `readTask` is called with the Mason config, `name: "doc-cleanup"`, `scope: ""`
- **THEN** it SHALL read from `.mason/tasks/doc-cleanup.md`

#### Scenario: Materialized Mason task uses nested path
- **WHEN** `materializeTasks` is called with the Mason config and a task `{ name: "apply", scope: "opsx" }`
- **THEN** the result SHALL contain key `".mason/tasks/opsx/apply.md"`
