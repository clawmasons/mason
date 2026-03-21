## MODIFIED Requirements

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
