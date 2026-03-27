## MODIFIED Requirements

### Requirement: claude-code-agent materializer forwards initialPrompt to generateAgentLaunchJson

`packages/claude-code-agent/src/materializer.ts` SHALL forward `options?.initialPrompt` as the `initialPrompt` argument to `generateAgentLaunchJson` in both `materializeWorkspace` and `materializeSupervisor`. It SHALL also forward `options?.jsonMode` as the `jsonMode` argument to `generateAgentLaunchJson`.

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

#### Scenario: jsonMode forwarded in workspace materialization

- **WHEN** `materializeWorkspace` is called with `options.jsonMode = true`
- **THEN** the call to `generateAgentLaunchJson` SHALL include `jsonMode: true`
- **AND** the resulting `agent-launch.json` SHALL include the agent's JSON streaming args

#### Scenario: jsonMode forwarded in supervisor materialization

- **WHEN** `materializeSupervisor` is called with `options.jsonMode = true`
- **THEN** the call to `generateAgentLaunchJson` SHALL include `jsonMode: true`
- **AND** the resulting `agent-launch.json` SHALL include the agent's JSON streaming args

#### Scenario: jsonMode not set — no JSON streaming args

- **WHEN** materializer is called without `jsonMode` in options
- **THEN** the generated `agent-launch.json` SHALL NOT include JSON streaming args
