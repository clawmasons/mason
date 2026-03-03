## ADDED Requirements

### Requirement: App schema validation
The system SHALL validate `pam` fields of type `"app"` against a Zod schema requiring `type`, `transport`, `tools`, and `capabilities`, with conditional fields based on transport type (stdio requires `command`+`args`, sse/streamable-http requires `url`). Optional fields: `env`, `description`.

#### Scenario: Valid stdio app
- **WHEN** a pam field with `type: "app"`, `transport: "stdio"`, `command: "npx"`, `args: ["-y", "@modelcontextprotocol/server-github"]`, `tools: ["create_issue"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppPamField` object

#### Scenario: Valid remote SSE app
- **WHEN** a pam field with `type: "app"`, `transport: "sse"`, `url: "https://example.com/sse"`, `tools: ["get_directions"]`, and `capabilities: ["tools"]` is validated
- **THEN** validation succeeds and returns a typed `AppPamField` object

#### Scenario: Stdio app missing command
- **WHEN** a pam field with `type: "app"`, `transport: "stdio"`, `tools: ["foo"]`, `capabilities: ["tools"]` but no `command` is validated
- **THEN** validation fails with a clear error indicating `command` is required for stdio transport

#### Scenario: App with env variables
- **WHEN** a pam field with `type: "app"` includes `env: { "TOKEN": "${MY_TOKEN}" }`
- **THEN** validation succeeds and preserves the env object with interpolation syntax

### Requirement: Skill schema validation
The system SHALL validate `pam` fields of type `"skill"` against a Zod schema requiring `type`, `artifacts`, and `description`.

#### Scenario: Valid skill
- **WHEN** a pam field with `type: "skill"`, `artifacts: ["./SKILL.md", "./examples/"]`, and `description: "Issue labeling"` is validated
- **THEN** validation succeeds and returns a typed `SkillPamField` object

#### Scenario: Skill missing artifacts
- **WHEN** a pam field with `type: "skill"` but no `artifacts` array is validated
- **THEN** validation fails with a clear error indicating `artifacts` is required

### Requirement: Task schema validation
The system SHALL validate `pam` fields of type `"task"` against a Zod schema requiring `type` and `taskType` (enum: subagent, script, composite, human), with optional fields: `prompt`, `requires` (object with `apps` and `skills` arrays), `timeout`, `approval` (enum: auto, confirm, review).

#### Scenario: Valid subagent task
- **WHEN** a pam field with `type: "task"`, `taskType: "subagent"`, `prompt: "./prompts/triage.md"`, `requires: { apps: ["@clawforge/app-github"], skills: ["@clawforge/skill-labeling"] }`, `timeout: "5m"`, `approval: "auto"` is validated
- **THEN** validation succeeds and returns a typed `TaskPamField` object

#### Scenario: Task with invalid taskType
- **WHEN** a pam field with `type: "task"` and `taskType: "unknown"` is validated
- **THEN** validation fails with a clear error listing valid task types

#### Scenario: Composite task
- **WHEN** a pam field with `type: "task"`, `taskType: "composite"` is validated
- **THEN** validation succeeds

### Requirement: Role schema validation
The system SHALL validate `pam` fields of type `"role"` against a Zod schema requiring `type` and `permissions` (object mapping app names to `{ allow: string[], deny: string[] }`), with optional fields: `description`, `tasks`, `skills`, `constraints`.

#### Scenario: Valid role with permissions
- **WHEN** a pam field with `type: "role"`, `permissions: { "@clawforge/app-github": { allow: ["create_issue", "list_repos"], deny: ["delete_repo"] } }`, `tasks: ["@clawforge/task-triage-issue"]` is validated
- **THEN** validation succeeds and returns a typed `RolePamField` object

#### Scenario: Role with deny wildcard
- **WHEN** a pam field with `type: "role"` includes `permissions: { "@clawforge/app-slack": { allow: ["send_message"], deny: ["*"] } }`
- **THEN** validation succeeds and preserves the wildcard deny entry

#### Scenario: Role with constraints
- **WHEN** a pam field with `type: "role"` includes `constraints: { maxConcurrentTasks: 3, requireApprovalFor: ["assign_issue"] }`
- **THEN** validation succeeds and returns the constraints object

### Requirement: Agent schema validation
The system SHALL validate `pam` fields of type `"agent"` against a Zod schema requiring `type`, `runtimes` (string array), and `roles` (string array), with optional fields: `description`, `resources` (array of objects with `type`, `ref`, `access`), `proxy` (object with `image`, `port`, `type`).

#### Scenario: Valid agent
- **WHEN** a pam field with `type: "agent"`, `runtimes: ["claude-code", "codex"]`, `roles: ["@clawforge/role-issue-manager"]`, `proxy: { image: "ghcr.io/tbxark/mcp-proxy:latest", port: 9090, type: "sse" }` is validated
- **THEN** validation succeeds and returns a typed `AgentPamField` object

#### Scenario: Agent with resources
- **WHEN** a pam field with `type: "agent"` includes `resources: [{ type: "github-repo", ref: "clawforge/openclaw", access: "read-write" }]`
- **THEN** validation succeeds and returns the resources array

#### Scenario: Agent missing runtimes
- **WHEN** a pam field with `type: "agent"` but no `runtimes` is validated
- **THEN** validation fails with a clear error indicating `runtimes` is required

### Requirement: Discriminated union parsing
The system SHALL provide a `parsePamField(input: unknown)` function that uses Zod's discriminated union on the `type` field to parse any valid pam field and return a precisely typed result. Invalid inputs SHALL produce actionable Zod error messages.

#### Scenario: Parse by type discrimination
- **WHEN** `parsePamField({ type: "app", transport: "stdio", command: "npx", args: [], tools: ["t"], capabilities: ["tools"] })` is called
- **THEN** the result is a success with data narrowed to `AppPamField`

#### Scenario: Parse with unknown type
- **WHEN** `parsePamField({ type: "unknown" })` is called
- **THEN** the result is a failure with an error indicating "unknown" is not a valid discriminator value

#### Scenario: Parse with missing type
- **WHEN** `parsePamField({})` is called
- **THEN** the result is a failure with an error indicating `type` is required
