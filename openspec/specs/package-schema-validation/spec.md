## Purpose

Zod-based schema validators for the `chapter` field in package.json across all five chapter package types (app, skill, task, role, member). Provides runtime validation with TypeScript type inference, a discriminated `parseChapterField()` entry point, and clear error messages for invalid metadata.

## Requirements

### Requirement: App schema validation
The system SHALL validate `chapter` fields of type `"app"` against a Zod schema requiring `type`, `transport`, `tools`, and `capabilities`, with conditional fields based on transport type (stdio requires `command`+`args`, sse/streamable-http requires `url`). Optional fields: `env`, `description`.

#### Scenario: Valid stdio app
- **WHEN** a chapter field with `type: "app"`, `transport: "stdio"`, `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]`, `tools: ["create_issue"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppChapterField` object

#### Scenario: Valid remote SSE app
- **WHEN** a chapter field with `type: "app"`, `transport: "sse"`, `url: "https://example.com/sse"`, `tools: ["get_directions"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppChapterField` object

#### Scenario: Stdio app missing command
- **WHEN** a chapter field with `type: "app"`, `transport: "stdio"`, `tools: ["foo"]`, `capabilities: ["tools"]` but no `command` is validated
- **THEN** validation fails with a clear error indicating `command` is required for stdio transport

#### Scenario: App with env variables
- **WHEN** a chapter field with `type: "app"` includes `env: { "TOKEN": "${MY_TOKEN}" }`
- **THEN** validation succeeds and preserves the env object with interpolation syntax

### Requirement: Skill schema validation
The system SHALL validate `chapter` fields of type `"skill"` against a Zod schema requiring `type`, `artifacts`, and `description`.

#### Scenario: Valid skill
- **WHEN** a chapter field with `type: "skill"`, `artifacts: ["./SKILL.md", "./examples/"]`, and `description: "Issue labeling"` is validated
- **THEN** validation succeeds and returns a typed `SkillChapterField` object

#### Scenario: Skill missing artifacts
- **WHEN** a chapter field with `type: "skill"` but no `artifacts` array is validated
- **THEN** validation fails with a clear error indicating `artifacts` is required

### Requirement: Task schema validation
The system SHALL validate `chapter` fields of type `"task"` against a Zod schema requiring `type` and `taskType` (enum: subagent, script, composite, human), with optional fields: `prompt`, `requires` (object with `apps` and `skills` arrays), `timeout`, `approval` (enum: auto, confirm, review).

#### Scenario: Valid subagent task
- **WHEN** a chapter field with `type: "task"`, `taskType: "subagent"`, `prompt: "./prompts/triage.md"`, `requires: { apps: ["@clawmasons/app-github"], skills: ["@clawmasons/skill-labeling"] }`, `timeout: "5m"`, `approval: "auto"` is validated
- **THEN** validation succeeds and returns a typed `TaskChapterField` object

#### Scenario: Task with invalid taskType
- **WHEN** a chapter field with `type: "task"` and `taskType: "unknown"` is validated
- **THEN** validation fails with a clear error listing valid task types

#### Scenario: Composite task
- **WHEN** a chapter field with `type: "task"`, `taskType: "composite"` is validated
- **THEN** validation succeeds

### Requirement: Role schema validation
The system SHALL validate `chapter` fields of type `"role"` against a Zod schema requiring `type` and `permissions` (object mapping app names to `{ allow: string[], deny: string[] }`), with optional fields: `description`, `tasks`, `skills`, `constraints`.

#### Scenario: Valid role with permissions
- **WHEN** a chapter field with `type: "role"`, `permissions: { "@clawmasons/app-github": { allow: ["create_issue", "list_repos"], deny: ["delete_repo"] } }`, `tasks: ["@clawmasons/task-triage-issue"]` is validated
- **THEN** validation succeeds and returns a typed `RoleChapterField` object

#### Scenario: Role with deny wildcard
- **WHEN** a chapter field with `type: "role"` includes `permissions: { "@clawmasons/app-slack": { allow: ["send_message"], deny: ["*"] } }`
- **THEN** validation succeeds and preserves the wildcard deny entry

#### Scenario: Role with constraints
- **WHEN** a chapter field with `type: "role"` includes `constraints: { maxConcurrentTasks: 3, requireApprovalFor: ["assign_issue"] }`
- **THEN** validation succeeds and returns the constraints object

### Requirement: Member schema validation
The system SHALL validate `chapter` fields of type `"member"` against a Zod discriminated union schema on `memberType`. Agent members (`memberType: "agent"`) require `name`, `slug`, `email`, `runtimes` (string array min 1), and `roles` (string array min 1), with optional fields: `description`, `authProviders` (string array, defaults to []), `resources` (array of objects with `type`, `ref`, `access`, defaults to []), `proxy` (object with `port`, `type`). Human members (`memberType: "human"`) require `name`, `slug`, `email`, and `roles`, with optional `description` and `authProviders`.

#### Scenario: Valid agent member
- **WHEN** a chapter field with `type: "member"`, `memberType: "agent"`, `name: "Ops"`, `slug: "ops"`, `email: "ops@chapter.local"`, `runtimes: ["claude-code-agent", "codex"]`, `roles: ["@clawmasons/role-issue-manager"]`, `proxy: { port: 9090, type: "sse" }` is validated
- **THEN** validation succeeds and returns a typed `MemberChapterField` object

#### Scenario: Valid human member
- **WHEN** a chapter field with `type: "member"`, `memberType: "human"`, `name: "Alice"`, `slug: "alice"`, `email: "alice@example.com"`, `roles: ["@clawmasons/role-reviewer"]` is validated
- **THEN** validation succeeds and returns a typed `MemberChapterField` object

#### Scenario: Agent member with resources
- **WHEN** a chapter field with `type: "member"`, `memberType: "agent"` includes `resources: [{ type: "github-repo", ref: "clawmasons/openclaw", access: "read-write" }]`
- **THEN** validation succeeds and returns the resources array

#### Scenario: Agent member missing runtimes
- **WHEN** a chapter field with `type: "member"`, `memberType: "agent"` but no `runtimes` is validated
- **THEN** validation fails with a clear error indicating `runtimes` is required

### Requirement: Discriminated union parsing
The system SHALL provide a `parseChapterField(input: unknown)` function that dispatches on the `type` field to parse any valid chapter field and return a precisely typed result. Invalid inputs SHALL produce actionable error messages.

#### Scenario: Parse by type discrimination
- **WHEN** `parseChapterField({ type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] })` is called
- **THEN** the result is a success with data narrowed to `AppChapterField`

#### Scenario: Parse with unknown type
- **WHEN** `parseChapterField({ type: "unknown" })` is called
- **THEN** the result is a failure with an error indicating "unknown" is not a valid discriminator value

#### Scenario: Parse with missing type
- **WHEN** `parseChapterField({})` is called
- **THEN** the result is a failure with an error indicating `type` is required
