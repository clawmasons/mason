## MODIFIED Requirements

### Requirement: generateAgentLaunchJson injects instructions as --append-system-prompt flag pair

`generateAgentLaunchJson` in `packages/agent-sdk/src/helpers.ts` SHALL accept an optional `initialPrompt?: string` parameter (after `agentArgs`). When `initialPrompt` is a non-empty string, it SHALL be appended as the final positional argument in the generated `args` array, after all flags and `agentArgs`.

The full args ordering SHALL be:
1. Base `runtime.args` (e.g., `["--effort", "max"]`)
2. `["--append-system-prompt", instructions]` when applicable
3. `agentArgs` (alias-level overrides)
4. `initialPrompt` as a bare positional string

#### Scenario: Instructions injected as flag pair

- **WHEN** `generateAgentLaunchJson` is called with `instructions = "Do the thing"`, `agentPkg.runtime.supportsAppendSystemPrompt = true`, and `acpMode = false`
- **THEN** the resulting `args` SHALL contain `"--append-system-prompt"` immediately followed by `"Do the thing"`
- **AND** `"Do the thing"` SHALL NOT appear as a bare positional argument without the flag preceding it

#### Scenario: initialPrompt appended as final positional

- **WHEN** `generateAgentLaunchJson` is called with `initialPrompt = "do this task"`
- **AND** `acpMode = false`
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

#### Scenario: agentArgs appended after flag pair

- **WHEN** `instructions` and `agentArgs` are both provided and `supportsAppendSystemPrompt = true`
- **THEN** `args` SHALL be `[...baseArgs, "--append-system-prompt", instructions, ...agentArgs]`

#### Scenario: Instructions not injected when flag is false or absent

- **WHEN** `supportsAppendSystemPrompt` is `false` or not declared
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected when instructions is undefined

- **WHEN** `instructions = undefined` and `supportsAppendSystemPrompt = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`

#### Scenario: Instructions not injected in ACP mode

- **WHEN** `acpMode = true`
- **THEN** `--append-system-prompt` SHALL NOT appear in `args`
