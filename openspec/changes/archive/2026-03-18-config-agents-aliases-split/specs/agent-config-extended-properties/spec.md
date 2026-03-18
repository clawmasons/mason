## MODIFIED Requirements

### Requirement: Agent config entry supports home, mode, role, and credentials properties

Each agent entry in `.mason/config.json` SHALL support only the `package` field. Runtime fields (`home`, `mode`, `role`, `credentials`, `devContainerCustomizations`) are no longer valid in `agents` entries — they belong in `aliases` entries instead.

#### Scenario: Agent entry with only package (the only valid form)
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code" }`
- **THEN** the CLI SHALL parse the entry without error

#### Scenario: Agent entry with runtime fields emits a deprecation warning
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code", "mode": "terminal", "role": "writer" }`
- **THEN** the CLI SHALL log a warning: `Agent "claude" has runtime fields (mode, role) in the "agents" config. Move these to an "aliases" entry. Runtime fields in "agents" will be removed in a future version.`
- **AND** the runtime fields SHALL still be applied during the deprecation period

#### Scenario: Agent entry with only package (backward compatible)
- **WHEN** `.mason/config.json` declares `"claude": { "package": "@clawmasons/claude-code" }`
- **THEN** the CLI SHALL parse the entry without error
- **AND** `home`, `mode`, `role`, and `credentials` SHALL all be `undefined`

#### Scenario: Invalid mode value is rejected with warning
- **WHEN** `.mason/config.json` declares `"myagent": { "package": "@foo/bar", "mode": "interactive" }`
- **THEN** the CLI SHALL log a warning: `Agent "myagent" has invalid mode "interactive" (expected terminal, acp, or bash). Defaulting to terminal.`
- **AND** the agent SHALL still be registered, using `"terminal"` as its effective mode

## REMOVED Requirements

### Requirement: home property is expanded and applied as a Docker volume mount

**Reason**: `home` is a runtime configuration property. It now belongs exclusively in `aliases` entries, not `agents` entries.
**Migration**: Move `"home"` from your `agents.<name>` entry to an `aliases.<name>` entry with `"agent": "<name>"`.

### Requirement: mode property sets the default startup mode

**Reason**: `mode` is a runtime configuration property. It now belongs exclusively in `aliases` entries, not `agents` entries.
**Migration**: Move `"mode"` from your `agents.<name>` entry to an `aliases.<name>` entry with `"agent": "<name>"`.

### Requirement: role property provides a default role name

**Reason**: `role` is a runtime configuration property. It now belongs exclusively in `aliases` entries, not `agents` entries.
**Migration**: Move `"role"` from your `agents.<name>` entry to an `aliases.<name>` entry with `"agent": "<name>"`. The no-role error message will be updated to reference `aliases` instead of `agents`.
