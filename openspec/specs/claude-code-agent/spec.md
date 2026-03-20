## MODIFIED Requirements

### Requirement: RuntimeConfig renames supportsInitialPrompt to supportsAppendSystemPrompt

`RuntimeConfig` in `packages/agent-sdk/src/types.ts` SHALL rename the field `supportsInitialPrompt` to `supportsAppendSystemPrompt`. The doc comment SHALL describe it as indicating the runtime accepts role instructions via `--append-system-prompt <text>`.

#### Scenario: Field exists under new name
- **WHEN** `RuntimeConfig` is defined
- **THEN** the field SHALL be `supportsAppendSystemPrompt?: boolean`
- **AND** there SHALL be no field named `supportsInitialPrompt`

---

### Requirement: generateAgentLaunchJson injects instructions as --append-system-prompt flag pair

`generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts` SHALL inject role instructions as the two-element sequence `["--append-system-prompt", instructions]` appended to `args`. The guard condition changes from `supportsInitialPrompt` to `supportsAppendSystemPrompt`.

#### Scenario: Instructions injected as flag pair
- **WHEN** `generateAgentLaunchJson` is called with `instructions = "Do the thing"`, `agentPkg.runtime.supportsAppendSystemPrompt = true`, and `acpMode = false`
- **THEN** the resulting `args` SHALL contain `"--append-system-prompt"` immediately followed by `"Do the thing"`
- **AND** `"Do the thing"` SHALL NOT appear as a bare positional argument without the flag preceding it

#### Scenario: agentArgs appended after flag pair
- **WHEN** `instructions` and `agentArgs` are both provided and `supportsAppendSystemPrompt = true`
- **THEN** `args` SHALL be `[...baseArgs, "--append-system-prompt", instructions, ...agentArgs]`

#### Scenario: Instructions not injected in ACP mode
- **WHEN** `acpMode = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected when flag is false or absent
- **WHEN** `supportsAppendSystemPrompt` is `false` or not declared
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected when instructions is undefined
- **WHEN** `instructions = undefined` and `supportsAppendSystemPrompt = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

---

### Requirement: claude-code-agent declares supportsAppendSystemPrompt

`packages/claude-code-agent/src/index.ts` SHALL declare `supportsAppendSystemPrompt: true` on its `runtime` config and SHALL NOT declare `supportsInitialPrompt`.

#### Scenario: Field present under new name
- **WHEN** the `claudeCodeAgent` package is loaded
- **THEN** `claudeCodeAgent.runtime.supportsAppendSystemPrompt` SHALL be `true`
- **AND** `claudeCodeAgent.runtime` SHALL NOT have a `supportsInitialPrompt` property

---

### Requirement: claude-code-agent materializer forwards initialPrompt to generateAgentLaunchJson

`packages/claude-code-agent/src/materializer.ts` SHALL forward `options?.initialPrompt` as the `initialPrompt` argument to `generateAgentLaunchJson` in both `materializeWorkspace` and `materializeSupervisor`.

#### Scenario: initialPrompt forwarded in workspace materialization

- **WHEN** `materializeWorkspace` is called with `options.initialPrompt = "do this task"`
- **THEN** the generated `agent-launch.json` SHALL include `"do this task"` as the final positional arg in `args`
- **AND** it SHALL appear after `--append-system-prompt` and `agentArgs` if those are present

#### Scenario: initialPrompt forwarded in supervisor materialization

- **WHEN** `materializeSupervisor` is called with `options.initialPrompt = "do this task"`
- **THEN** the generated `agent-launch.json` SHALL include `"do this task"` as the final positional arg in `args`

#### Scenario: No initialPrompt — agent-launch.json unchanged

- **WHEN** materializer is called with no `initialPrompt` in options
- **THEN** the generated `agent-launch.json` SHALL NOT include any bare positional string in `args`
