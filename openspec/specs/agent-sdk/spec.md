## Purpose

Defines the `AgentPackage` interface and SDK helpers for agent package implementations. Provides common materializer utilities, type re-exports, and task read/write functions.

## Requirements

### Requirement: AgentPackage interface defines the contract for agent packages

The system SHALL define an `AgentPackage` interface that all agent packages MUST implement. The interface SHALL include:
- `name: string` — the primary agent type identifier used in `mason run --agent <name>`
- `aliases?: string[]` — optional alternative names for the agent
- `materializer: RuntimeMaterializer` — the workspace materialization implementation
- `dockerfile?: DockerfileConfig` — optional Dockerfile generation hooks
- `acp?: AcpConfig` — optional ACP mode configuration
- `runtime?: RuntimeConfig` — optional runtime command configuration

#### Scenario: Agent package implements full interface
- **WHEN** an agent package exports an `AgentPackage` object with `name` and `materializer`
- **THEN** it SHALL be accepted by the agent registry

#### Scenario: Agent package with optional fields omitted
- **WHEN** an agent package exports an `AgentPackage` with only `name` and `materializer` (no `dockerfile`, `acp`, or `runtime`)
- **THEN** it SHALL be accepted and the CLI SHALL use default values for omitted fields

### Requirement: DockerfileConfig provides Dockerfile generation hooks

The `AgentPackage.dockerfile` field SHALL be a `DockerfileConfig` object with:
- `baseImage?: string` — default base Docker image (e.g., `"node:22-slim"`)
- `installSteps?: string` — Dockerfile RUN instructions to install the agent runtime (raw Dockerfile lines)
- `aptPackages?: string[]` — additional apt packages required by the agent runtime

#### Scenario: Agent declares install steps
- **WHEN** an agent package sets `dockerfile.installSteps` to `"RUN npm install -g @anthropic-ai/claude-code"`
- **THEN** the Dockerfile generator SHALL include that line in the generated Dockerfile

#### Scenario: Agent declares no install steps
- **WHEN** an agent package omits `dockerfile.installSteps`
- **THEN** the Dockerfile generator SHALL produce a Dockerfile with no agent-specific install step

#### Scenario: Agent declares apt packages
- **WHEN** an agent package sets `dockerfile.aptPackages` to `["git", "curl"]`
- **THEN** the Dockerfile generator SHALL include an `apt-get install` step for those packages, merged with any role-declared apt packages

### Requirement: AcpConfig provides ACP mode command

The `AgentPackage.acp` field SHALL be an `AcpConfig` object with:
- `command: string` — the command to start the agent in ACP mode (e.g., `"claude-agent-acp"`)

The `acp.command` value SHALL be used when generating `agent-launch.json` for ACP mode sessions. It SHALL NOT be used to generate any `.chapter/acp.json` file.

#### Scenario: Agent declares ACP command used in agent-launch.json
- **WHEN** an agent package sets `acp.command` to `"claude-agent-acp"`
- **AND** `generateAgentLaunchJson` is called with `acpMode: true`
- **THEN** the generated `agent-launch.json` SHALL use `"claude-agent-acp"` as the runtime command

#### Scenario: Agent omits ACP config
- **WHEN** an agent package does not set the `acp` field
- **THEN** the agent SHALL not support ACP mode and attempting to run it in ACP mode SHALL produce an error

### Requirement: RuntimeConfig provides agent-launch.json configuration

The `AgentPackage.runtime` field SHALL be a `RuntimeConfig` object with:
- `command: string` — the default command to run the agent (e.g., `"claude"`)
- `args?: string[]` — default command arguments (e.g., `["--effort", "max"]`)
- `credentials?: Array<{ key: string; type: "env" | "file"; path?: string }>` — additional credentials the runtime always requires

#### Scenario: Agent declares runtime command and args
- **WHEN** an agent package sets `runtime.command` to `"claude"` and `runtime.args` to `["--effort", "max"]`
- **THEN** the generated `agent-launch.json` SHALL use these values for the command and args fields

#### Scenario: Agent declares runtime credentials
- **WHEN** an agent package sets `runtime.credentials` with a file credential
- **THEN** the generated `agent-launch.json` SHALL include those credentials merged with role-declared credentials

#### Scenario: Agent omits runtime config
- **WHEN** an agent package does not set the `runtime` field
- **THEN** the generated `agent-launch.json` SHALL use the agent `name` as the default command with no args

### Requirement: Agent packages use default export convention

Each agent package SHALL export its `AgentPackage` object as the default export of the package's main entry point. Named exports for individual components (e.g., the materializer) SHALL also be available.

#### Scenario: Default import resolves AgentPackage
- **WHEN** the CLI runs `import agent from "@clawmasons/claude-code-agent"`
- **THEN** the `agent` variable SHALL be an `AgentPackage` object with `name`, `materializer`, and other fields

#### Scenario: Named import for materializer
- **WHEN** the CLI runs `import { claudeCodeMaterializer } from "@clawmasons/claude-code-agent"`
- **THEN** the import SHALL resolve to the `RuntimeMaterializer` implementation

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

### Requirement: generateAgentLaunchJson accepts initialPrompt as final positional arg

`generateAgentLaunchJson` SHALL accept an optional `initialPrompt?: string` parameter (after `agentArgs`). When `initialPrompt` is a non-empty string and `acpMode` is false, it SHALL be appended as the final positional argument in the generated `args` array, after all flags and `agentArgs`.

The full args ordering SHALL be:
1. Base `runtime.args` (e.g., `["--effort", "max"]`)
2. `["--append-system-prompt", instructions]` when applicable
3. `agentArgs` (alias-level overrides)
4. `initialPrompt` as a bare positional string

#### Scenario: initialPrompt appended as final positional

- **WHEN** `generateAgentLaunchJson` is called with `initialPrompt = "do this task"` and `acpMode = false`
- **THEN** the resulting `args` SHALL have `"do this task"` as the last element
- **AND** all flag args SHALL precede it

#### Scenario: Full arg ordering with all params

- **WHEN** `generateAgentLaunchJson` is called with `instructions`, `agentArgs = ["--extra"]`, and `initialPrompt = "go"`
- **AND** `supportsAppendSystemPrompt = true` and `acpMode = false`
- **THEN** `args` SHALL be `[...baseArgs, "--append-system-prompt", instructions, "--extra", "go"]`

#### Scenario: initialPrompt not injected when undefined or empty

- **WHEN** `initialPrompt` is `undefined` or `""`
- **THEN** no bare positional string SHALL be appended to `args`

#### Scenario: initialPrompt not injected in ACP mode

- **WHEN** `acpMode = true` and `initialPrompt = "do this"`
- **THEN** `"do this"` SHALL NOT appear in `args`

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

### Requirement: collectAllSkills collects from roles only

`collectAllSkills(roles)` SHALL collect unique skills from `role.skills` only. It SHALL NOT iterate into `task.skills` because tasks no longer carry skill references.

#### Scenario: Skills collected from roles
- **WHEN** `collectAllSkills` is called with roles containing skills
- **THEN** it SHALL return all unique skills from the roles
- **AND** it SHALL NOT attempt to access `task.skills`

### Requirement: Agent materializers use _agentPkg.tasks from parent AgentPackage

Agent materializers SHALL reference `_agentPkg.tasks` from the parent `AgentPackage` (set via `_setAgentPackage()`) when calling `materializeTasks()`. They SHALL NOT duplicate inline `AgentTaskConfig` objects.

#### Scenario: Claude-code-agent uses _agentPkg.tasks
- **WHEN** the claude-code-agent materializer generates task files
- **THEN** it SHALL call `materializeTasks(tasks, _agentPkg.tasks)` using the config from the AgentPackage
- **AND** it SHALL NOT define a separate inline `AgentTaskConfig`

#### Scenario: Pi-coding-agent uses _agentPkg.tasks
- **WHEN** the pi-coding-agent materializer generates task files
- **THEN** it SHALL call `materializeTasks(tasks, _agentPkg.tasks)` using the config from the AgentPackage

### Requirement: Packaged roles include source.path

The `package-reader.ts` SHALL include `path: packagePath` in the source object for packaged roles. This enables `resolveTaskContent()` to locate task files in packages.

#### Scenario: Packaged role has source.path
- **WHEN** a role is read from a package
- **THEN** the `role.source` object SHALL include `path` set to the package directory path
- **AND** `resolveTaskContent()` SHALL be able to use this path to find task files

### Requirement: SDK re-exports shared types for convenience

The `@clawmasons/agent-sdk` package SHALL re-export the following types from `@clawmasons/shared`:
- `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedSkill`
- `MaterializationResult`, `MaterializeOptions`, `RuntimeMaterializer`
- `AgentTaskConfig`

#### Scenario: Agent package imports types from SDK only
- **WHEN** an agent package needs `ResolvedAgent`, `RuntimeMaterializer`, and `AgentTaskConfig`
- **THEN** it SHALL be able to import all from `@clawmasons/agent-sdk` without a direct `@clawmasons/shared` dependency
