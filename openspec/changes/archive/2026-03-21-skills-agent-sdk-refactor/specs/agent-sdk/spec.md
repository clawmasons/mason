## ADDED Requirements

### Requirement: AgentPackage includes optional skills config

The `AgentPackage` interface SHALL include an optional `skills?: AgentSkillConfig` field. When provided, it declares where the agent stores skill files in the workspace. When omitted, the agent does not support generic skill materialization.

#### Scenario: Agent package with skills config
- **WHEN** an agent package exports an `AgentPackage` with `skills: { projectFolder: ".claude/skills" }`
- **THEN** the agent registry SHALL accept it
- **AND** `materializeSkills()` and `readSkills()` SHALL use the config to read/write skill files

#### Scenario: Agent package without skills config
- **WHEN** an agent package exports an `AgentPackage` with `skills` omitted
- **THEN** the agent registry SHALL accept it
- **AND** the materializer SHALL not attempt to generate skill files via `materializeSkills()`

### Requirement: SDK exports readSkills and materializeSkills helpers

The `@clawmasons/agent-sdk` package SHALL export the following helper functions:
- `readSkills(config: AgentSkillConfig, projectDir: string): ResolvedSkill[]`
- `materializeSkills(skills: ResolvedSkill[], config: AgentSkillConfig): MaterializationResult`

#### Scenario: Agent materializer uses materializeSkills
- **WHEN** an agent materializer calls `materializeSkills(skills, agentPkg.skills)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL return a `MaterializationResult` with skill file entries matching the agent's skill config

#### Scenario: SDK exports AgentSkillConfig type
- **WHEN** an agent package imports `AgentSkillConfig` from `@clawmasons/agent-sdk`
- **THEN** the import SHALL resolve to the interface defining `projectFolder`

### Requirement: SDK re-exports AgentSkillConfig from shared

The `@clawmasons/agent-sdk` package SHALL re-export `AgentSkillConfig` from `@clawmasons/shared` alongside existing type re-exports.

#### Scenario: AgentSkillConfig available from SDK
- **WHEN** an agent package runs `import { AgentSkillConfig } from "@clawmasons/agent-sdk"`
- **THEN** the import SHALL resolve successfully

## MODIFIED Requirements

### Requirement: SDK exports common helper functions

The `@clawmasons/agent-sdk` package SHALL export the following helper functions for use by agent materializer implementations:
- `generateAgentLaunchJson(agentPkg: AgentPackage, roleCredentials: string[], acpMode?: boolean, instructions?: string, agentArgs?: string[], initialPrompt?: string): string`
- `formatPermittedTools(permissions): string`
- `collectAllTasks(roles: ResolvedRole[]): Array<[ResolvedTask, ResolvedRole[]]>`
- `readTasks(config: AgentTaskConfig, projectDir: string): ResolvedTask[]`
- `materializeTasks(tasks: ResolvedTask[], config: AgentTaskConfig): MaterializationResult`
- `readSkills(config: AgentSkillConfig, projectDir: string): ResolvedSkill[]`
- `materializeSkills(skills: ResolvedSkill[], config: AgentSkillConfig): MaterializationResult`
- `collectAllSkills(roles: ResolvedRole[]): Map<string, ResolvedSkill>`

The following functions SHALL be removed from public exports:
- `generateSkillReadme` — replaced by `materializeSkills`

#### Scenario: Agent package uses materializeSkills
- **WHEN** an agent materializer calls `materializeSkills(skills, config)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL produce materialization entries with the actual skill file contents (SKILL.md + companions)

#### Scenario: generateSkillReadme is no longer exported
- **WHEN** an agent package attempts to import `generateSkillReadme` from `@clawmasons/agent-sdk`
- **THEN** the import SHALL fail (function no longer exported)

### Requirement: Agent materializers use _agentPkg.skills from parent AgentPackage

Agent materializers SHALL reference `_agentPkg.skills` from the parent `AgentPackage` (set via `_setAgentPackage()`) when calling `materializeSkills()`. They SHALL NOT duplicate inline `AgentSkillConfig` objects.

#### Scenario: Claude-code-agent uses _agentPkg.skills
- **WHEN** the claude-code-agent materializer generates skill files
- **THEN** it SHALL call `materializeSkills(skills, _agentPkg.skills)` using the config from the AgentPackage
- **AND** it SHALL NOT define a separate inline `AgentSkillConfig`

#### Scenario: Pi-coding-agent uses _agentPkg.skills
- **WHEN** the pi-coding-agent materializer generates skill files
- **THEN** it SHALL call `materializeSkills(skills, _agentPkg.skills)` using the config from the AgentPackage

## REMOVED Requirements

### Requirement: generateSkillReadme generates synthetic README
**Reason**: Replaced by `materializeSkills` which copies actual SKILL.md and companion files directly, providing real skill content instead of a synthetic listing of artifact paths.
**Migration**: Replace all `generateSkillReadme(skill)` calls with `materializeSkills(skills, agentPkg.skills)`. The new function returns a `MaterializationResult` that callers merge into their output map.
