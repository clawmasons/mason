## MODIFIED Requirements

### Requirement: Task mapping
The system SHALL map `TaskRef[]` to `ResolvedTask[]`. Each `TaskRef` SHALL produce a `ResolvedTask` with:
- `name` — from `TaskRef.name`
- `version` — `"0.0.0"`
- `prompt` — from the task's instructions content (if available)
- `displayName`, `description`, `category`, `tags`, `scope` — populated from task metadata when available, otherwise `undefined`/empty

The adapter SHALL NOT set `taskType`, `apps`, `skills`, or `subTasks` on the `ResolvedTask` (these properties no longer exist).

#### Scenario: Task refs become resolved tasks
- **GIVEN** a Role with tasks `[{name: "define-change"}, {name: "review-change"}]`
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole SHALL contain two ResolvedTasks with those names
- **AND** each task SHALL have `version: "0.0.0"` and `prompt` set from instructions

#### Scenario: Task with metadata produces enriched ResolvedTask
- **GIVEN** a Role with a task that has `name: "triage"`, `description: "Triage issues"`, and instructions content
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedTask SHALL have `name: "triage"`, `description: "Triage issues"`, and `prompt` from instructions

#### Scenario: Adapted task does not include removed properties
- **GIVEN** a Role with tasks
- **WHEN** adapted to ResolvedAgent
- **THEN** the resulting ResolvedTask objects SHALL NOT have `taskType`, `apps`, `skills`, or `subTasks` properties
