## MODIFIED Requirements

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
