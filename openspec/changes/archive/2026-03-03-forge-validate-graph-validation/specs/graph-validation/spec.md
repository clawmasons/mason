## Purpose

Validate a resolved agent dependency graph for semantic correctness. Checks requirement coverage (task-required apps are covered by parent role permissions), tool existence (role allow-list tools exist in app's tool list), skill availability (task-required skills are resolvable through the role), and app launch config validity. Provides both a programmatic API and a `forge validate` CLI command as a CI/CD governance gate.

## ADDED Requirements

### Requirement: Validate requirement coverage
The system SHALL check that for every task in a role, each app listed in the task's `requires.apps` has a corresponding entry in the parent role's `permissions` object. A task cannot use an app that its role doesn't govern.

#### Scenario: Task requires an app covered by role permissions
- **WHEN** role `@clawforge/role-issue-manager` has `permissions: { "@clawforge/app-github": { allow: ["create_issue"], deny: [] } }` and task `@clawforge/task-triage-issue` has `requires: { apps: ["@clawforge/app-github"] }`
- **THEN** validation passes with no requirement coverage errors

#### Scenario: Task requires an app not in role permissions
- **WHEN** role `@clawforge/role-issue-manager` has `permissions: { "@clawforge/app-github": { allow: ["create_issue"], deny: [] } }` and task `@clawforge/task-triage-issue` has `requires: { apps: ["@clawforge/app-github", "@clawforge/app-slack"] }` but the role has no permissions entry for `@clawforge/app-slack`
- **THEN** validation fails with a requirement coverage error identifying role `@clawforge/role-issue-manager`, task `@clawforge/task-triage-issue`, and uncovered app `@clawforge/app-slack`

### Requirement: Validate tool existence
The system SHALL check that every tool in a role's `permissions[app].allow` list exists in the corresponding resolved app's `tools` array. A role cannot allow a tool that the app doesn't expose.

#### Scenario: All allowed tools exist in app
- **WHEN** role allows tools `["create_issue", "list_repos"]` on `@clawforge/app-github` and the app's `tools` list includes both `create_issue` and `list_repos`
- **THEN** validation passes with no tool existence errors

#### Scenario: Role allows a tool not exposed by app
- **WHEN** role allows tools `["create_issue", "nonexistent_tool"]` on `@clawforge/app-github` and the app's `tools` list does not include `nonexistent_tool`
- **THEN** validation fails with a tool existence error identifying the role, app, and the missing tool `nonexistent_tool`

### Requirement: Validate skill availability
The system SHALL check that every skill in a task's `requires.skills` is available — either directly resolved in the task's own skills, or present in the parent role's resolved skills.

#### Scenario: Task skill available via task resolution
- **WHEN** task `@clawforge/task-triage-issue` requires skill `@clawforge/skill-labeling` and the resolved task's `skills` array contains a skill with name `@clawforge/skill-labeling`
- **THEN** validation passes with no skill availability errors

#### Scenario: Task skill available via parent role
- **WHEN** task `@clawforge/task-triage-issue` requires skill `@clawforge/skill-labeling`, the task's own resolved skills do not include it, but the parent role's resolved `skills` array includes it
- **THEN** validation passes with no skill availability errors

#### Scenario: Task skill not available anywhere
- **WHEN** task `@clawforge/task-triage-issue` requires skill `@clawforge/skill-missing`, the task's resolved skills do not include it, and the parent role's resolved skills do not include it
- **THEN** validation fails with a skill availability error identifying the task and the missing skill

### Requirement: Validate app launch config
The system SHALL check that every resolved app has valid launch configuration: stdio transport apps must have `command` and `args` defined; sse and streamable-http transport apps must have `url` defined.

#### Scenario: Valid stdio app
- **WHEN** an app has `transport: "stdio"`, `command: "npx"`, and `args: ["-y", "@modelcontextprotocol/server-github"]`
- **THEN** validation passes with no app launch config errors

#### Scenario: Valid SSE app
- **WHEN** an app has `transport: "sse"` and `url: "https://mcp.amap.com/sse"`
- **THEN** validation passes with no app launch config errors

#### Scenario: Stdio app missing command
- **WHEN** an app has `transport: "stdio"` but `command` is undefined
- **THEN** validation fails with an app launch config error identifying the app and the missing field

#### Scenario: SSE app missing url
- **WHEN** an app has `transport: "sse"` but `url` is undefined
- **THEN** validation fails with an app launch config error identifying the app and the missing field

### Requirement: Collect all validation errors
The system SHALL collect all validation errors across all check categories rather than failing on the first error. The validation result SHALL contain all errors found, enabling developers to fix all problems in a single pass.

#### Scenario: Multiple errors across categories
- **WHEN** an agent has both a tool existence error (role allows nonexistent tool) and a requirement coverage error (task requires uncovered app)
- **THEN** the validation result contains both errors, each with its own category and context

### Requirement: Structured validation result
The `validateAgent()` function SHALL return a `ValidationResult` containing: `valid` (boolean), `errors` (array of `ValidationError`). Each `ValidationError` SHALL contain: `category` (one of `requirement-coverage`, `tool-existence`, `skill-availability`, `app-launch-config`), `message` (human-readable description), and `context` (object with relevant identifiers like role name, task name, app name, tool name).

#### Scenario: Valid agent returns clean result
- **WHEN** `validateAgent(resolvedAgent)` is called on a fully valid agent
- **THEN** the result has `valid: true` and `errors: []`

#### Scenario: Invalid agent returns structured errors
- **WHEN** `validateAgent(resolvedAgent)` is called on an agent with validation issues
- **THEN** the result has `valid: false` and `errors` contains one or more `ValidationError` objects with populated `category`, `message`, and `context` fields

### Requirement: CLI validate command
The system SHALL provide a `forge validate <agent>` CLI command that discovers packages, resolves the agent graph, runs validation, and outputs results. The command SHALL exit with code 0 when the agent is valid and non-zero when validation fails. The command SHALL support a `--json` flag for machine-readable output.

#### Scenario: Valid agent CLI output
- **WHEN** `forge validate @clawforge/agent-repo-ops` is run and the agent passes all checks
- **THEN** the command prints a success message and exits with code 0

#### Scenario: Invalid agent CLI output
- **WHEN** `forge validate @clawforge/agent-repo-ops` is run and the agent has validation errors
- **THEN** the command prints each error with its category and context, and exits with code 1

#### Scenario: JSON output mode
- **WHEN** `forge validate @clawforge/agent-repo-ops --json` is run
- **THEN** the command outputs the `ValidationResult` as JSON to stdout

#### Scenario: Agent not found
- **WHEN** `forge validate @clawforge/nonexistent` is run and the agent package cannot be discovered
- **THEN** the command prints an error message and exits with non-zero code
