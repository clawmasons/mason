## Purpose

Stateless adapter function that converts a `Role` (from the ROLE_TYPES pipeline) into the existing `ResolvedAgent` shape that materializers already accept. This is the key migration bridge: it lets the new ROLE_TYPES pipeline feed into existing materializers without rewriting them.

## Requirements

### Requirement: Basic adaptation
The system SHALL provide `adaptRoleToResolvedAgent(role: Role, agentType: string): ResolvedAgent` that maps all Role fields to the ResolvedAgent structure.

#### Scenario: Minimal Role produces valid ResolvedAgent
- **GIVEN** a Role with only required fields (metadata.name, metadata.description, instructions, source)
- **WHEN** `adaptRoleToResolvedAgent(role, "claude-code-agent")` is called
- **THEN** a valid ResolvedAgent is returned with name, version, agentName, slug, runtimes, credentials, and a single ResolvedRole

#### Scenario: Full Role preserves all fields
- **GIVEN** a Role with tasks, apps, skills, container, governance, and resources
- **WHEN** `adaptRoleToResolvedAgent(role, "claude-code-agent")` is called
- **THEN** all fields are mapped to the corresponding ResolvedAgent/ResolvedRole fields

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

### Requirement: App mapping
The system SHALL map `AppConfig[]` to `ResolvedApp[]` preserving transport, command, args, url, env, and credentials.

#### Scenario: App configs become resolved apps
- **GIVEN** a Role with apps including transport, command, and tool permissions
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole contains ResolvedApps with those fields preserved

### Requirement: Permissions aggregation
The system SHALL aggregate `apps[].tools` into `ResolvedRole.permissions` keyed by app name.

#### Scenario: Tool permissions are aggregated
- **GIVEN** a Role with an app named "github" with tools `{allow: ["create_issue"], deny: ["delete_repo"]}`
- **WHEN** adapted to ResolvedAgent
- **THEN** `resolvedRole.permissions["github"]` equals `{allow: ["create_issue"], deny: ["delete_repo"]}`

### Requirement: Container requirements mapping
The system SHALL map container.packages.apt to ResolvedRole.aptPackages, container.mounts to ResolvedRole.mounts, and container.baseImage to ResolvedRole.baseImage.

#### Scenario: Container fields carry through
- **GIVEN** a Role with container packages `{apt: ["jq", "curl"]}`, mounts, and baseImage
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole has aptPackages, mounts, and baseImage set correctly

### Requirement: Governance mapping
The system SHALL map governance.risk to ResolvedRole.risk, governance.constraints to ResolvedRole.constraints, and governance.credentials to ResolvedAgent.credentials.

#### Scenario: Governance fields carry through
- **GIVEN** a Role with risk "HIGH", constraints, and credentials
- **WHEN** adapted to ResolvedAgent
- **THEN** ResolvedRole.risk is "HIGH", constraints are preserved, and ResolvedAgent.credentials includes the governance credentials

### Requirement: Agent type validation
The system SHALL throw `AdapterError` if the agentType does not match a registered dialect.

#### Scenario: Unknown agent type
- **GIVEN** agentType "unknown-runtime"
- **WHEN** `adaptRoleToResolvedAgent(role, "unknown-runtime")` is called
- **THEN** an `AdapterError` is thrown

### Requirement: Skill mapping
The system SHALL map `SkillRef[]` to `ResolvedSkill[]`.

#### Scenario: Skill refs become resolved skills
- **GIVEN** a Role with skills `[{name: "prd-writing", ref: "@acme/skill-prd-writing"}]`
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole contains a ResolvedSkill with name "prd-writing"
