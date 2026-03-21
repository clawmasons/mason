## MODIFIED Requirements

### Requirement: Task mapping
The system SHALL map `TaskRef[]` to `ResolvedTask[]`. Each `TaskRef` SHALL produce a **minimal** `ResolvedTask` with:
- `name` — from `TaskRef.name`
- `version` — `"0.0.0"`
- `prompt` — `undefined` (the adapter does NOT set prompt content; actual task content is resolved later by `resolveTaskContent()` in the CLI materializer layer)
- `displayName`, `description`, `category`, `tags`, `scope` — `undefined` (populated later by `resolveTaskContent()`)

The adapter SHALL NOT set `taskType`, `apps`, `skills`, or `subTasks` on the `ResolvedTask` (these properties no longer exist).

The adapter is intentionally stateless — it maps `TaskRef` references to `ResolvedTask` shells. The CLI materializer layer is responsible for reading actual task file content from disk and populating `prompt` and metadata fields via `resolveTaskContent()`.

#### Scenario: Task refs become resolved tasks
- **GIVEN** a Role with tasks `[{name: "define-change"}, {name: "review-change"}]`
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole SHALL contain two ResolvedTasks with those names
- **AND** each task SHALL have `version: "0.0.0"` and `prompt: undefined`

#### Scenario: Adapted task has undefined prompt
- **GIVEN** a Role with a task `{name: "triage"}` and role instructions "You are a triage agent."
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedTask SHALL have `name: "triage"`, `version: "0.0.0"`, and `prompt: undefined`
- **AND** the role instructions SHALL NOT be set as the task prompt

#### Scenario: Adapted task does not include removed properties
- **GIVEN** a Role with tasks
- **WHEN** adapted to ResolvedAgent
- **THEN** the resulting ResolvedTask objects SHALL NOT have `taskType`, `apps`, `skills`, or `subTasks` properties

### Requirement: Task content resolution (CLI materializer layer)

The CLI materializer layer SHALL provide a `resolveTaskContent(agent: ResolvedAgent, role: Role): void` function that:
1. Determines the source agent's `AgentTaskConfig` from `role.source.agentDialect` → agent registry → `agentPkg.tasks`. Falls back to a mason default config for "mason" dialect or unknown.
2. Determines the source project directory from `role.source.path` (3 levels up for local roles, package directory for packaged roles).
3. Calls `readTasks(sourceConfig, sourceProjectDir)` to get tasks with actual prompt content.
4. Merges by name: matches read tasks to `agent.roles[].tasks[]`, copies `prompt`, `displayName`, `description`, `category`, `tags`, and `scope`.

This function is called:
- In `materializeForAgent()` after `adaptRoleToResolvedAgent()` and before the materializer call
- In the supervisor path of `docker-generator.ts` after `adaptRoleToResolvedAgent(role, agentType)`

#### Scenario: Task content resolved from source files
- **GIVEN** a Role with source pointing to a local directory containing task files
- **AND** the role has tasks `[{name: "fix-bug"}]`
- **WHEN** `resolveTaskContent` is called after adaptation
- **THEN** the resolved task `"fix-bug"` SHALL have its `prompt` populated from the actual task file content
- **AND** metadata fields (`displayName`, `description`, etc.) SHALL be populated from the source file's frontmatter

#### Scenario: No source path gracefully skips resolution
- **GIVEN** a Role with no `source.path`
- **WHEN** `resolveTaskContent` is called
- **THEN** it SHALL return without error and leave task prompts as `undefined`
