## ADDED Requirements

### Requirement: readTask resolves a single task by scope and name

The system SHALL provide a `readTask(config: AgentTaskConfig, projectDir: string, name: string, scope: string): ResolvedTask | undefined` function that:
1. Calls `resolveNameFormat(config.nameFormat, name, scope)` to compute the relative file path
2. Prepends `config.projectFolder` and `projectDir` to build the absolute path
3. If the file exists, reads and parses YAML frontmatter + markdown body
4. Returns a `ResolvedTask` with the given `name`, `scope`, and parsed content
5. Returns `undefined` if the file does not exist

#### Scenario: Resolve scoped task with path format
- **WHEN** `readTask` is called with `nameFormat: "{scopePath}/{taskName}.md"`, `projectFolder: ".claude/commands"`, `name: "apply"`, `scope: "opsx"`
- **AND** the file `.claude/commands/opsx/apply.md` exists with frontmatter and body
- **THEN** it SHALL return a `ResolvedTask` with `name: "apply"`, `scope: "opsx"`, and `prompt` set to the markdown body

#### Scenario: Resolve scoped task with kebab format
- **WHEN** `readTask` is called with `nameFormat: "{scopeKebab}-{taskName}.md"`, `projectFolder: ".mason/tasks"`, `name: "apply"`, `scope: "opsx"`
- **AND** the file `.mason/tasks/opsx-apply.md` exists
- **THEN** it SHALL return a `ResolvedTask` with `name: "apply"`, `scope: "opsx"`, and `prompt` set to the markdown body

#### Scenario: Resolve unscoped task
- **WHEN** `readTask` is called with `name: "doc-cleanup"`, `scope: ""`
- **AND** the file `.claude/commands/doc-cleanup.md` exists
- **THEN** it SHALL return a `ResolvedTask` with `name: "doc-cleanup"`, `scope: ""`, and `prompt` set to the markdown body

#### Scenario: Task file does not exist
- **WHEN** `readTask` is called with `name: "nonexistent"`, `scope: "opsx"`
- **AND** no file exists at the resolved path
- **THEN** it SHALL return `undefined`

#### Scenario: Deeply nested scope
- **WHEN** `readTask` is called with `name: "label-issue"`, `scope: "ops:triage"`, `nameFormat: "{scopePath}/{taskName}.md"`
- **AND** the file `.claude/commands/ops/triage/label-issue.md` exists
- **THEN** it SHALL return a `ResolvedTask` with `name: "label-issue"`, `scope: "ops:triage"`

### Requirement: resolveTaskContent uses targeted single-file reads

The `resolveTaskContent()` function SHALL resolve each task by calling `readTask()` with the task's `name` and `scope` instead of bulk-reading all tasks via `readTasks()` and matching by name.

#### Scenario: Scoped task resolves correctly
- **WHEN** `resolveTaskContent` processes a task with `name: "apply"`, `scope: "opsx"`
- **AND** the source config has `nameFormat: "{scopePath}/{taskName}.md"`, `projectFolder: ".claude/commands"`
- **THEN** it SHALL read the file at `.claude/commands/opsx/apply.md` directly
- **AND** populate `prompt`, `displayName`, `description`, `category`, and `tags` from the file

#### Scenario: Unscoped task resolves correctly
- **WHEN** `resolveTaskContent` processes a task with `name: "doc-cleanup"`, `scope: ""`
- **THEN** it SHALL read the file at `.claude/commands/doc-cleanup.md` directly

#### Scenario: Missing task logs warning
- **WHEN** `resolveTaskContent` processes a task with `name: "missing"`, `scope: "opsx"`
- **AND** no file exists at the resolved path
- **THEN** it SHALL log a warning with the task name and searched path
