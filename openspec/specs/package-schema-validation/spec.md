## Purpose

Zod-based schema validators for the metadata field in package.json across all five package types (app, skill, task, role, member). Provides runtime validation with TypeScript type inference, a discriminated `parseField()` entry point, and clear error messages for invalid metadata.

## Requirements

### Requirement: App schema validation
The system SHALL validate fields of type `"app"` against a Zod schema requiring `type`, `transport`, `tools`, and `capabilities`, with conditional fields based on transport type (stdio requires `command`+`args`, sse/streamable-http requires `url`). Optional fields: `env`, `description`.

#### Scenario: Valid stdio app
- **WHEN** a field with `type: "app"`, `transport: "stdio"`, `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]`, `tools: ["create_issue"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppField` object

#### Scenario: Valid remote SSE app
- **WHEN** a field with `type: "app"`, `transport: "sse"`, `url: "https://example.com/sse"`, `tools: ["get_directions"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppField` object

#### Scenario: Stdio app missing command
- **WHEN** a field with `type: "app"`, `transport: "stdio"`, `tools: ["foo"]`, `capabilities: ["tools"]` but no `command` is validated
- **THEN** validation fails with a clear error indicating `command` is required for stdio transport

#### Scenario: App with env variables
- **WHEN** a field with `type: "app"` includes `env: { "TOKEN": "${MY_TOKEN}" }`
- **THEN** validation succeeds and preserves the env object with interpolation syntax

### Requirement: Skill schema validation
The system SHALL validate fields of type `"skill"` against a Zod schema requiring `type`, `artifacts`, and `description`.

#### Scenario: Valid skill
- **WHEN** a field with `type: "skill"`, `artifacts: ["./SKILL.md", "./examples/"]`, and `description: "Issue labeling"` is validated
- **THEN** validation succeeds and returns a typed `SkillField` object

#### Scenario: Skill missing artifacts
- **WHEN** a field with `type: "skill"` but no `artifacts` array is validated
- **THEN** validation fails with a clear error indicating `artifacts` is required

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

### Requirement: Role schema validation
The system SHALL validate fields of type `"role"` against a Zod schema requiring `type` and `permissions` (object mapping app names to `{ allow: string[], deny: string[] }`), with optional fields: `description`, `tasks`, `skills`, `constraints`.

#### Scenario: Valid role with permissions
- **WHEN** a field with `type: "role"`, `permissions: { "@clawmasons/app-github": { allow: ["create_issue", "list_repos"], deny: ["delete_repo"] } }`, `tasks: ["@clawmasons/task-triage-issue"]` is validated
- **THEN** validation succeeds and returns a typed `RoleField` object

#### Scenario: Role with deny wildcard
- **WHEN** a field with `type: "role"` includes `permissions: { "@clawmasons/app-slack": { allow: ["send_message"], deny: ["*"] } }`
- **THEN** validation succeeds and preserves the wildcard deny entry

#### Scenario: Role with constraints
- **WHEN** a field with `type: "role"` includes `constraints: { maxConcurrentTasks: 3, requireApprovalFor: ["assign_issue"] }`
- **THEN** validation succeeds and returns the constraints object

### Requirement: Member schema validation
The system SHALL validate fields of type `"member"` against a Zod discriminated union schema on `memberType`. Agent members (`memberType: "agent"`) require `name`, `slug`, `email`, `runtimes` (string array min 1), and `roles` (string array min 1), with optional fields: `description`, `authProviders` (string array, defaults to []), `resources` (array of objects with `type`, `ref`, `access`, defaults to []), `proxy` (object with `port`, `type`). Human members (`memberType: "human"`) require `name`, `slug`, `email`, and `roles`, with optional `description` and `authProviders`.

#### Scenario: Valid agent member
- **WHEN** a field with `type: "member"`, `memberType: "agent"`, `name: "Ops"`, `slug: "ops"`, `email: "ops@chapter.local"`, `runtimes: ["claude-code-agent", "codex"]`, `roles: ["@clawmasons/role-issue-manager"]`, `proxy: { port: 9090, type: "sse" }` is validated
- **THEN** validation succeeds and returns a typed `MemberField` object

#### Scenario: Valid human member
- **WHEN** a field with `type: "member"`, `memberType: "human"`, `name: "Alice"`, `slug: "alice"`, `email: "alice@example.com"`, `roles: ["@clawmasons/role-reviewer"]` is validated
- **THEN** validation succeeds and returns a typed `MemberField` object

#### Scenario: Agent member with resources
- **WHEN** a field with `type: "member"`, `memberType: "agent"` includes `resources: [{ type: "github-repo", ref: "clawmasons/openclaw", access: "read-write" }]`
- **THEN** validation succeeds and returns the resources array

#### Scenario: Agent member missing runtimes
- **WHEN** a field with `type: "member"`, `memberType: "agent"` but no `runtimes` is validated
- **THEN** validation fails with a clear error indicating `runtimes` is required

### Requirement: Discriminated union parsing
The system SHALL provide a `parseField(input: unknown)` function that dispatches on the `type` field to parse any valid metadata field and return a precisely typed result. Invalid inputs SHALL produce actionable error messages. The union type SHALL be named `Field` (not `ChapterField`).

#### Scenario: Parse by type discrimination
- **WHEN** `parseField({ type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] })` is called
- **THEN** the result is a success with data narrowed to `AppField`

#### Scenario: Parse with unknown type
- **WHEN** `parseField({ type: "unknown" })` is called
- **THEN** the result is a failure with an error indicating "unknown" is not a valid discriminator value

#### Scenario: Parse with missing type
- **WHEN** `parseField({})` is called
- **THEN** the result is a failure with an error indicating `type` is required
