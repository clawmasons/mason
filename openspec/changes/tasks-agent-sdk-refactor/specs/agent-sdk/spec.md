## ADDED Requirements

### Requirement: AgentPackage includes optional tasks config

The `AgentPackage` interface SHALL include an optional `tasks?: AgentTaskConfig` field. When provided, it declares how the agent stores task files in the workspace. When omitted, the agent does not support generic task materialization.

#### Scenario: Agent package with tasks config
- **WHEN** an agent package exports an `AgentPackage` with `tasks: { projectFolder: ".claude/commands", nameFormat: "{scopePath}/{taskName}.md", scopeFormat: "path", supportedFields: ["name->displayName", "description"], prompt: "markdown-body" }`
- **THEN** the agent registry SHALL accept it
- **AND** `materializeTasks()` and `readTasks()` SHALL use the config to read/write task files

#### Scenario: Agent package without tasks config
- **WHEN** an agent package exports an `AgentPackage` with `tasks` omitted
- **THEN** the agent registry SHALL accept it
- **AND** the materializer SHALL not attempt to generate task files via `materializeTasks()`

### Requirement: SDK exports readTasks and materializeTasks helpers

The `@clawmasons/agent-sdk` package SHALL export the following additional helper functions:
- `readTasks(config: AgentTaskConfig, projectDir: string): ResolvedTask[]`
- `materializeTasks(tasks: ResolvedTask[], config: AgentTaskConfig): MaterializationResult`

#### Scenario: Agent materializer uses materializeTasks
- **WHEN** an agent materializer calls `materializeTasks(tasks, agentPkg.tasks)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL return a `MaterializationResult` with task file entries matching the agent's task config

#### Scenario: SDK exports AgentTaskConfig type
- **WHEN** an agent package imports `AgentTaskConfig` from `@clawmasons/agent-sdk`
- **THEN** the import SHALL resolve to the interface defining `projectFolder`, `nameFormat`, `scopeFormat`, `supportedFields`, and `prompt`

## MODIFIED Requirements

### Requirement: SDK exports common helper functions

The `@clawmasons/agent-sdk` package SHALL export the following helper functions for use by agent materializer implementations:
- `generateSkillReadme(skill: ResolvedSkill): string`
- `generateAgentLaunchJson(agentPkg: AgentPackage, roleCredentials: string[], acpMode?: boolean, instructions?: string, agentArgs?: string[], initialPrompt?: string): string`
- `formatPermittedTools(permissions): string`
- `collectAllSkills(roles: ResolvedRole[]): Map<string, ResolvedSkill>`
- `collectAllTasks(roles: ResolvedRole[]): Array<[ResolvedTask, ResolvedRole[]]>`
- `readTasks(config: AgentTaskConfig, projectDir: string): ResolvedTask[]`
- `materializeTasks(tasks: ResolvedTask[], config: AgentTaskConfig): MaterializationResult`

These functions SHALL be available from the SDK package.

#### Scenario: Agent package uses SDK helpers
- **WHEN** an agent materializer calls `generateSkillReadme(skill)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL produce a skill README with the skill's description and artifacts

#### Scenario: generateAgentLaunchJson uses AgentPackage runtime config
- **WHEN** `generateAgentLaunchJson()` is called
- **THEN** it SHALL accept runtime config from the `AgentPackage.runtime` field instead of hardcoded `RUNTIME_COMMANDS` and `RUNTIME_CREDENTIALS` maps

### Requirement: collectAllSkills collects from roles only

`collectAllSkills(roles)` SHALL collect unique skills from `role.skills` only. It SHALL NOT iterate into `task.skills` because tasks no longer carry skill references.

#### Scenario: Skills collected from roles
- **WHEN** `collectAllSkills` is called with roles containing skills
- **THEN** it SHALL return all unique skills from the roles
- **AND** it SHALL NOT attempt to access `task.skills`

### Requirement: SDK re-exports shared types for convenience

The `@clawmasons/agent-sdk` package SHALL re-export the following types from `@clawmasons/shared`:
- `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedSkill`
- `MaterializationResult`, `MaterializeOptions`, `RuntimeMaterializer`
- `AgentTaskConfig`

#### Scenario: Agent package imports types from SDK only
- **WHEN** an agent package needs `ResolvedAgent`, `RuntimeMaterializer`, and `AgentTaskConfig`
- **THEN** it SHALL be able to import all from `@clawmasons/agent-sdk` without a direct `@clawmasons/shared` dependency
