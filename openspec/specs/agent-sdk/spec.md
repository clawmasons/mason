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

These functions SHALL be available from the SDK package.

#### Scenario: Agent package uses materializeSkills
- **WHEN** an agent materializer calls `materializeSkills(skills, config)` from `@clawmasons/agent-sdk`
- **THEN** it SHALL produce materialization entries with the actual skill file contents (SKILL.md + companions)

#### Scenario: generateSkillReadme is no longer exported
- **WHEN** an agent package attempts to import `generateSkillReadme` from `@clawmasons/agent-sdk`
- **THEN** the import SHALL fail (function no longer exported)

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

### Requirement: SDK re-exports AgentSkillConfig from shared

The `@clawmasons/agent-sdk` package SHALL re-export `AgentSkillConfig` from `@clawmasons/shared` alongside existing type re-exports.

#### Scenario: AgentSkillConfig available from SDK
- **WHEN** an agent package runs `import { AgentSkillConfig } from "@clawmasons/agent-sdk"`
- **THEN** the import SHALL resolve successfully

### Requirement: Agent materializers use _agentPkg.skills from parent AgentPackage

Agent materializers SHALL reference `_agentPkg.skills` from the parent `AgentPackage` (set via `_setAgentPackage()`) when calling `materializeSkills()`. They SHALL NOT duplicate inline `AgentSkillConfig` objects.

#### Scenario: Claude-code-agent uses _agentPkg.skills
- **WHEN** the claude-code-agent materializer generates skill files
- **THEN** it SHALL call `materializeSkills(skills, _agentPkg.skills)` using the config from the AgentPackage
- **AND** it SHALL NOT define a separate inline `AgentSkillConfig`

#### Scenario: Pi-coding-agent uses _agentPkg.skills
- **WHEN** the pi-coding-agent materializer generates skill files
- **THEN** it SHALL call `materializeSkills(skills, _agentPkg.skills)` using the config from the AgentPackage

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

### Requirement: Testing subpath export provides shared e2e utilities

The `@clawmasons/agent-sdk` package SHALL export a `./testing` subpath (`@clawmasons/agent-sdk/testing`) that provides shared e2e test utilities. The testing module SHALL export:
- `PROJECT_ROOT: string` — absolute path to the monorepo root
- `MASON_BIN: string` — absolute path to `scripts/mason.js`
- `FIXTURES_DIR: string` — absolute path to `packages/agent-sdk/fixtures/`
- `copyFixtureWorkspace(name, opts?)` — copies a fixture to a temp directory, returns the path
- `masonExec(args, cwd, opts?)` — runs the mason CLI binary, returns stdout
- `masonExecJson<T>(args, cwd, opts?)` — runs mason CLI with --json and parses output
- `masonExecExpectError(args, cwd, opts?)` — runs a command expected to fail, returns `{ stdout, stderr, exitCode }`
- `isDockerAvailable()` — checks if Docker daemon is reachable
- `waitForHealth(url, timeoutMs, diagnostics?)` — polls a health endpoint
- `cleanupDockerSessions(workspaceDir)` — tears down Docker Compose sessions

The testing module SHALL NOT import from `@clawmasons/cli`, `@clawmasons/mcp-agent`, or any agent implementation package. It SHALL only use Node.js built-ins.

#### Scenario: Import testing utilities from subpath
- **WHEN** a test file runs `import { copyFixtureWorkspace, masonExec } from "@clawmasons/agent-sdk/testing"`
- **THEN** the imports SHALL resolve correctly at both compile time and runtime

#### Scenario: copyFixtureWorkspace creates temp workspace from fixture
- **WHEN** `copyFixtureWorkspace("my-test")` is called
- **THEN** it SHALL copy the default `claude-test-project` fixture to a temp directory
- **AND** the returned path SHALL contain "mason-e2e-my-test"
- **AND** the workspace SHALL contain `package.json`, `.claude/`, `.mason/` directories

#### Scenario: copyFixtureWorkspace throws on missing fixture
- **WHEN** `copyFixtureWorkspace("test", { fixture: "nonexistent" })` is called
- **THEN** it SHALL throw an error containing "not found"

#### Scenario: copyFixtureWorkspace supports extraDirs
- **WHEN** `copyFixtureWorkspace("test", { extraDirs: [".codex"] })` is called
- **THEN** it SHALL copy the `.codex/` directory from the fixture (or create an empty one if absent)

#### Scenario: Testing module has no circular dependencies
- **WHEN** the testing module source is inspected
- **THEN** it SHALL contain zero imports from `@clawmasons/cli`, `@clawmasons/mcp-agent`, `@clawmasons/claude-code-agent`, or `@clawmasons/pi-coding-agent`

### Requirement: Shared fixtures directory contains claude-test-project

The `packages/agent-sdk/fixtures/` directory SHALL contain the `claude-test-project` fixture with:
- `package.json` — minimal project manifest
- `.claude/commands/take-notes.md` — note-taking slash command
- `.claude/skills/markdown-conventions/SKILL.md` — markdown formatting skill
- `.mason/roles/writer/ROLE.md` — writer role with MCP server config

The `fixtures` directory SHALL be included in the package's `files` field for npm publishing.

#### Scenario: FIXTURES_DIR resolves to existing directory
- **WHEN** `FIXTURES_DIR` is resolved
- **THEN** it SHALL point to `packages/agent-sdk/fixtures/`
- **AND** the directory SHALL contain `claude-test-project/`

### Requirement: SDK re-exports shared types for convenience

The `@clawmasons/agent-sdk` package SHALL re-export the following types from `@clawmasons/shared`:
- `ResolvedAgent`, `ResolvedRole`, `ResolvedTask`, `ResolvedSkill`
- `MaterializationResult`, `MaterializeOptions`, `RuntimeMaterializer`
- `AgentTaskConfig`, `AgentSkillConfig`

#### Scenario: Agent package imports types from SDK only
- **WHEN** an agent package needs `ResolvedAgent`, `RuntimeMaterializer`, and `AgentTaskConfig`
- **THEN** it SHALL be able to import all from `@clawmasons/agent-sdk` without a direct `@clawmasons/shared` dependency
