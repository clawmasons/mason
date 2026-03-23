## ADDED Requirements

### Requirement: AgentPackage includes optional printMode config

The `AgentPackage` interface SHALL include an optional `printMode` field with the following shape:

- `jsonStreamArgs: string[]` — args appended to the agent command to enable JSON streaming output (e.g., `["--output-format", "stream-json"]` for claude, `["--mode", "json"]` for pi)
- `parseJsonStreamFinalResult(line: string): string | null` — a method that parses a single line from the JSON stream and returns the final result text when found, or `null` to continue reading. Callers SHALL invoke this method within a try/catch; exceptions are logged and treated as `null`.

When `printMode` is omitted, the agent does not support non-interactive print mode.

#### Scenario: Agent package declares printMode

- **WHEN** an agent package exports an `AgentPackage` with `printMode: { jsonStreamArgs: ["--output-format", "stream-json"], parseJsonStreamFinalResult: ... }`
- **THEN** the agent registry SHALL accept it
- **AND** print mode SHALL be available for this agent

#### Scenario: Agent package omits printMode

- **WHEN** an agent package exports an `AgentPackage` without `printMode`
- **THEN** the agent registry SHALL accept it
- **AND** attempting to use `-p` with this agent SHALL produce an error indicating print mode is not supported

#### Scenario: parseJsonStreamFinalResult returns null for non-final lines

- **WHEN** `parseJsonStreamFinalResult` is called with a line that does not contain the final result
- **THEN** it SHALL return `null`

#### Scenario: parseJsonStreamFinalResult returns result text for final line

- **WHEN** `parseJsonStreamFinalResult` is called with a line containing the final result
- **THEN** it SHALL return the extracted result text as a string

### Requirement: MaterializeOptions includes printMode boolean

The `MaterializeOptions` interface SHALL include an optional `printMode?: boolean` field. When `true`, materializers SHALL pass print mode to `generateAgentLaunchJson` so that JSON streaming args and `-p` prompt flag are included in `agent-launch.json`.

#### Scenario: printMode passed through materialization

- **WHEN** a materializer is called with `options.printMode = true`
- **THEN** it SHALL pass `printMode: true` to `generateAgentLaunchJson`
- **AND** the resulting `agent-launch.json` SHALL include the agent's JSON streaming args and `-p` prompt flag

#### Scenario: printMode omitted defaults to false

- **WHEN** a materializer is called without `printMode` in options
- **THEN** it SHALL NOT add JSON streaming args or `-p` flag to `agent-launch.json`

## MODIFIED Requirements

### Requirement: SDK exports common helper functions

The `@clawmasons/agent-sdk` package SHALL export the following helper functions for use by agent materializer implementations:
- `generateAgentLaunchJson(agentPkg: AgentPackage, roleCredentials: string[], acpMode?: boolean, instructions?: string, agentArgs?: string[], initialPrompt?: string, printMode?: boolean): string`
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

`generateAgentLaunchJson` SHALL accept an optional `initialPrompt?: string` parameter (after `agentArgs`) and an optional `printMode?: boolean` parameter (after `initialPrompt`).

When `printMode` is `false` or omitted: if `initialPrompt` is a non-empty string and `acpMode` is false, it SHALL be appended as the final bare positional argument in the generated `args` array.

When `printMode` is `true` and `acpMode` is `false`:
1. The agent's `printMode.jsonStreamArgs` SHALL be appended to the args array
2. The `initialPrompt` SHALL be passed as `["-p", initialPrompt]` instead of a bare positional arg

The full args ordering in print mode SHALL be:
1. Base `runtime.args` (e.g., `["--effort", "max"]`)
2. `["--append-system-prompt", instructions]` when applicable
3. `agentArgs` (alias-level overrides)
4. JSON stream args (e.g., `["--output-format", "stream-json"]`)
5. `["-p", initialPrompt]`

#### Scenario: initialPrompt appended as final positional (non-print mode)

- **WHEN** `generateAgentLaunchJson` is called with `initialPrompt = "do this task"`, `printMode = false`, and `acpMode = false`
- **THEN** the resulting `args` SHALL have `"do this task"` as the last element as a bare positional arg

#### Scenario: Print mode emits json stream args and -p flag

- **WHEN** `generateAgentLaunchJson` is called with `initialPrompt = "say hello"`, `printMode = true`, and `acpMode = false`
- **AND** the agent's `printMode.jsonStreamArgs` is `["--output-format", "stream-json"]`
- **THEN** `args` SHALL include `["--output-format", "stream-json", "-p", "say hello"]` after all other flags

#### Scenario: Full arg ordering with all params in print mode

- **WHEN** `generateAgentLaunchJson` is called with `instructions`, `agentArgs = ["--extra"]`, `initialPrompt = "go"`, and `printMode = true`
- **AND** `supportsAppendSystemPrompt = true` and `acpMode = false`
- **AND** `jsonStreamArgs = ["--output-format", "stream-json"]`
- **THEN** `args` SHALL be `[...baseArgs, "--append-system-prompt", instructions, "--extra", "--output-format", "stream-json", "-p", "go"]`

#### Scenario: initialPrompt not injected when undefined or empty

- **WHEN** `initialPrompt` is `undefined` or `""`
- **THEN** no bare positional string or `-p` flag SHALL be appended to `args`

#### Scenario: initialPrompt not injected in ACP mode

- **WHEN** `acpMode = true` and `initialPrompt = "do this"`
- **THEN** `"do this"` SHALL NOT appear in `args` regardless of `printMode`
