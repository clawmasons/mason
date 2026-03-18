## ADDED Requirements

### Requirement: aliases section defines named runnable presets in config

`.mason/config.json` SHALL support a top-level `"aliases"` key whose value is a record of alias names to `AliasEntryConfig` objects. Each alias entry SHALL support the following fields:
- `agent` (string, required): key in the `agents` registry
- `mode` (`"terminal" | "acp" | "bash"`, optional): default startup mode
- `role` (string, optional): default role name
- `home` (string, optional): host path to mount at `/home/mason/`
- `credentials` (string[], optional): additional credential env var keys
- `devContainerCustomizations` (optional): VSCode extensions and settings
- `agent-args` (string[], optional): extra args appended to the agent invocation

#### Scenario: Valid aliases section is parsed without error
- **WHEN** `.mason/config.json` contains `"aliases": { "frontend": { "agent": "claude", "mode": "terminal", "role": "frontend-dev" } }`
- **THEN** the CLI SHALL parse the entry without error
- **AND** `mode`, `role`, and `agent` SHALL be accessible when dispatching the `frontend` alias

#### Scenario: Alias with only agent field is valid
- **WHEN** `.mason/config.json` declares `"aliases": { "quick": { "agent": "claude" } }`
- **THEN** the CLI SHALL parse the entry without error
- **AND** `mode`, `role`, `home`, `credentials`, and `agent-args` SHALL all be `undefined`

#### Scenario: Alias referencing unknown agent emits an error
- **WHEN** an alias entry references `"agent": "nonexistent"`
- **AND** `"nonexistent"` is not a key in the `agents` registry
- **THEN** the CLI SHALL log an error: `Alias "<name>" references unknown agent "nonexistent"`
- **AND** exit with code 1

### Requirement: mason {alias} dispatches the alias directly

The CLI SHALL allow `mason <aliasName>` as a first-class invocation form. Aliases are resolved before agent names — if `<aliasName>` matches a key in `aliases`, the alias is dispatched.

#### Scenario: mason {alias} starts the agent with alias runtime config
- **WHEN** an alias `"frontend"` declares `{ "agent": "claude", "mode": "terminal", "role": "frontend-dev", "home": "~/projects/fe" }`
- **AND** the user runs `mason frontend`
- **THEN** the CLI SHALL start the `claude` agent in terminal mode with role `frontend-dev` and home mount `~/projects/fe`

#### Scenario: CLI flags override alias runtime config
- **WHEN** an alias `"frontend"` declares `{ "agent": "claude", "mode": "terminal", "role": "frontend-dev" }`
- **AND** the user runs `mason frontend --role backend-dev --acp`
- **THEN** the CLI SHALL start the `claude` agent in ACP mode with role `backend-dev`

#### Scenario: Alias takes precedence over agent name on collision
- **WHEN** an alias key and an agent key share the same name `"claude"`
- **AND** the user runs `mason claude`
- **THEN** the CLI SHALL dispatch the alias, not the bare agent
- **AND** the CLI SHALL log a warning: `Alias "claude" shadows agent name "claude". The alias will be used.`

### Requirement: agent-args are forwarded to the agent invocation

When an alias entry specifies `agent-args`, the CLI SHALL append those strings to the agent container's entrypoint args, after all mason-resolved args.

#### Scenario: agent-args are appended after resolved args
- **WHEN** an alias declares `{ "agent": "claude", "mode": "acp", "agent-args": ["--max-turns", "10"] }`
- **AND** the user runs `mason api-review`
- **THEN** the agent SHALL be invoked with args equivalent to `--acp --max-turns 10`

#### Scenario: CLI flags take precedence over agent-args
- **WHEN** an alias declares `{ "agent": "claude", "agent-args": ["--max-turns", "5"] }`
- **AND** the user runs `mason api-review --max-turns 20`
- **THEN** the effective `--max-turns` value SHALL be `20`

### Requirement: Invalid mode in alias is rejected with warning

When an alias entry specifies an unrecognized `mode` value, the CLI SHALL warn and default to `"terminal"`.

#### Scenario: Invalid mode value in alias defaults to terminal
- **WHEN** an alias declares `{ "agent": "claude", "mode": "interactive" }`
- **THEN** the CLI SHALL log a warning: `Alias "<name>" has invalid mode "interactive" (expected terminal, acp, or bash). Defaulting to terminal.`
- **AND** the alias SHALL still be registered using `"terminal"` as its effective mode
