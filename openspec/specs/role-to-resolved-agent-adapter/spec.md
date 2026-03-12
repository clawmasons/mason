## Purpose

Stateless adapter function that converts a `RoleType` (from the ROLE_TYPES pipeline) into the existing `ResolvedAgent` shape that materializers already accept. This is the key migration bridge: it lets the new ROLE_TYPES pipeline feed into existing materializers without rewriting them.

## Requirements

### Requirement: Basic adaptation
The system SHALL provide `adaptRoleToResolvedAgent(role: RoleType, agentType: string): ResolvedAgent` that maps all RoleType fields to the ResolvedAgent structure.

#### Scenario: Minimal RoleType produces valid ResolvedAgent
- **GIVEN** a RoleType with only required fields (metadata.name, metadata.description, instructions, source)
- **WHEN** `adaptRoleToResolvedAgent(role, "claude-code")` is called
- **THEN** a valid ResolvedAgent is returned with name, version, agentName, slug, runtimes, credentials, and a single ResolvedRole

#### Scenario: Full RoleType preserves all fields
- **GIVEN** a RoleType with tasks, apps, skills, container, governance, and resources
- **WHEN** `adaptRoleToResolvedAgent(role, "claude-code")` is called
- **THEN** all fields are mapped to the corresponding ResolvedAgent/ResolvedRole fields

### Requirement: Task mapping
The system SHALL map `TaskRef[]` to `ResolvedTask[]` with taskType defaulting to `"subagent"`.

#### Scenario: Task refs become resolved tasks
- **GIVEN** a RoleType with tasks `[{name: "define-change"}, {name: "review-change"}]`
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole contains two ResolvedTasks with those names and taskType `"subagent"`

### Requirement: App mapping
The system SHALL map `AppConfig[]` to `ResolvedApp[]` preserving transport, command, args, url, env, and credentials.

#### Scenario: App configs become resolved apps
- **GIVEN** a RoleType with apps including transport, command, and tool permissions
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole contains ResolvedApps with those fields preserved

### Requirement: Permissions aggregation
The system SHALL aggregate `apps[].tools` into `ResolvedRole.permissions` keyed by app name.

#### Scenario: Tool permissions are aggregated
- **GIVEN** a RoleType with an app named "github" with tools `{allow: ["create_issue"], deny: ["delete_repo"]}`
- **WHEN** adapted to ResolvedAgent
- **THEN** `resolvedRole.permissions["github"]` equals `{allow: ["create_issue"], deny: ["delete_repo"]}`

### Requirement: Container requirements mapping
The system SHALL map container.packages.apt to ResolvedRole.aptPackages, container.mounts to ResolvedRole.mounts, and container.baseImage to ResolvedRole.baseImage.

#### Scenario: Container fields carry through
- **GIVEN** a RoleType with container packages `{apt: ["jq", "curl"]}`, mounts, and baseImage
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole has aptPackages, mounts, and baseImage set correctly

### Requirement: Governance mapping
The system SHALL map governance.risk to ResolvedRole.risk, governance.constraints to ResolvedRole.constraints, and governance.credentials to ResolvedAgent.credentials.

#### Scenario: Governance fields carry through
- **GIVEN** a RoleType with risk "HIGH", constraints, and credentials
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
- **GIVEN** a RoleType with skills `[{name: "prd-writing", ref: "@acme/skill-prd-writing"}]`
- **WHEN** adapted to ResolvedAgent
- **THEN** the ResolvedRole contains a ResolvedSkill with name "prd-writing"
