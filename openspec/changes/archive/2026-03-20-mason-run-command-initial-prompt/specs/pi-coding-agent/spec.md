## MODIFIED Requirements

### Requirement: pi-coding-agent emits .pi/APPEND_SYSTEM.md when instructions are present

`packages/pi-coding-agent/src/materializer.ts`'s `materializeWorkspace` SHALL write `.pi/APPEND_SYSTEM.md` containing `agent.roles[0].instructions` when that value is a non-empty string.

The materializer SHALL also forward `options?.initialPrompt` as the `initialPrompt` argument to `generateAgentLaunchJson`, enabling the pi runtime to receive an initial message at launch.

#### Scenario: File emitted when instructions present

- **WHEN** `agent.roles[0].instructions` is a non-empty string
- **THEN** the `MaterializationResult` SHALL include `".pi/APPEND_SYSTEM.md"` with that string as its value

#### Scenario: File absent when instructions absent

- **WHEN** `agent.roles[0].instructions` is `undefined` or an empty string
- **THEN** the `MaterializationResult` SHALL NOT include `".pi/APPEND_SYSTEM.md"`

#### Scenario: initialPrompt forwarded to agent-launch.json

- **WHEN** `materializeWorkspace` is called with `options.initialPrompt = "do this task"`
- **THEN** the generated `agent-launch.json` SHALL include `"do this task"` as the final positional arg in `args`

#### Scenario: No initialPrompt — agent-launch.json unchanged

- **WHEN** `materializeWorkspace` is called with no `initialPrompt` in options
- **THEN** the generated `agent-launch.json` SHALL NOT include any bare positional string in `args`
