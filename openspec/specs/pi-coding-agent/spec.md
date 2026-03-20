## MODIFIED Requirements

### Requirement: pi-coding-agent emits .pi/APPEND_SYSTEM.md when instructions are present

`packages/pi-coding-agent/src/materializer.ts`'s `materializeWorkspace` SHALL write `.pi/APPEND_SYSTEM.md` containing `agent.roles[0].instructions` when that value is a non-empty string.

#### Scenario: File emitted when instructions present
- **WHEN** `agent.roles[0].instructions` is a non-empty string
- **THEN** the `MaterializationResult` SHALL include `".pi/APPEND_SYSTEM.md"` with that string as its value

#### Scenario: File absent when instructions absent
- **WHEN** `agent.roles[0].instructions` is `undefined` or an empty string
- **THEN** the `MaterializationResult` SHALL NOT include `".pi/APPEND_SYSTEM.md"`
