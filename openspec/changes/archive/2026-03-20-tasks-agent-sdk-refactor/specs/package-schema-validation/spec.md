## MODIFIED Requirements

### Requirement: Task schema validation
The system SHALL validate fields of type `"task"` against a Zod schema requiring only `type: "task"`, with optional fields: `prompt` (string), `description` (string).

The following fields are removed: `taskType`, `requires`, `tasks`, `timeout`, `approval`.

#### Scenario: Valid task with prompt
- **WHEN** a field with `type: "task"` and `prompt: "./prompts/triage.md"` is validated
- **THEN** validation succeeds and returns a typed `TaskField` object

#### Scenario: Valid task with description
- **WHEN** a field with `type: "task"` and `description: "Triage incoming issues"` is validated
- **THEN** validation succeeds and returns a typed `TaskField` object

#### Scenario: Minimal task with only type
- **WHEN** a field with only `type: "task"` is validated
- **THEN** validation succeeds and returns a typed `TaskField` object

#### Scenario: Task with removed field taskType is rejected
- **WHEN** a field with `type: "task"` and `taskType: "subagent"` is validated
- **THEN** validation SHALL fail because `taskType` is not a recognized field

#### Scenario: Task with removed field timeout is rejected
- **WHEN** a field with `type: "task"` and `timeout: "5m"` is validated
- **THEN** validation SHALL fail because `timeout` is not a recognized field

#### Scenario: Task with removed field approval is rejected
- **WHEN** a field with `type: "task"` and `approval: "auto"` is validated
- **THEN** validation SHALL fail because `approval` is not a recognized field

#### Scenario: Task with removed field requires is rejected
- **WHEN** a field with `type: "task"` and `requires: { apps: ["@clawmasons/app-github"] }` is validated
- **THEN** validation SHALL fail because `requires` is not a recognized field
