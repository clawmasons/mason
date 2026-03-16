## ADDED Requirements

### Requirement: --agent-type flag is renamed to --agent

The `mason run` command SHALL accept `--agent <name>` in place of `--agent-type <name>`. The old `--agent-type` flag SHALL no longer be recognised. The positional `[agent-type]` argument SHALL be renamed to `[agent]` for consistency; its behaviour is otherwise unchanged.

#### Scenario: --agent flag accepted
- **WHEN** the user runs `mason run --role writer --agent claude`
- **THEN** the CLI SHALL resolve `claude` as the agent and start normally

#### Scenario: --agent-type rejected
- **WHEN** the user runs `mason run --role writer --agent-type claude`
- **THEN** Commander SHALL report an unknown option error and exit with code 1

### Requirement: mason run --agent resolves config entry before agent-type registry

When `--agent <name>` (or the positional `[agent]`) is provided, the CLI SHALL first look up `<name>` in `.mason/config.json` agent entries. If found, it SHALL apply the entry's `home`, `mode`, and `role` defaults before resolving the agent package. If not found in config, it SHALL fall back to the existing agent-type registry (built-in agents and aliases).

#### Scenario: --agent matches config entry
- **WHEN** `.mason/config.json` declares `"openclaw": { "package": "@clawmasons/openclaw", "role": "coder" }`
- **AND** the user runs `mason run --agent openclaw`
- **THEN** the CLI SHALL load `@clawmasons/openclaw` as the agent package
- **AND** SHALL use `"coder"` as the default role (unless `--role` overrides it)

#### Scenario: --agent falls back to built-in registry
- **WHEN** `.mason/config.json` does not declare an entry named `"claude-code"`
- **AND** the user runs `mason run --agent claude-code --role writer`
- **THEN** the CLI SHALL resolve `"claude-code"` via the built-in agent registry

#### Scenario: --agent unknown in both config and registry
- **WHEN** `.mason/config.json` does not declare `"unknown"`
- **AND** `"unknown"` is not a registered built-in agent type or alias
- **THEN** the CLI SHALL print an error listing all known agent names (from both config and registry)
- **AND** exit with code 1

### Requirement: installAgentTypeShorthand recognises config-declared agent names

The pre-parse shorthand hook that rewrites `mason <name> [args]` to `mason run <name> [args]` SHALL also trigger for agent names declared in `.mason/config.json`, not only for names in the in-memory agent-type registry.

The config keys SHALL be read synchronously (no dynamic imports) from `.mason/config.json` at startup, before `program.parse()` is called, so they are available during the shorthand detection phase.

#### Scenario: shorthand fires for config-declared agent name
- **WHEN** `.mason/config.json` declares `"openclaw": { "package": "..." }`
- **AND** the user runs `mason openclaw`
- **THEN** the CLI SHALL rewrite the invocation to `mason run openclaw`
- **AND** proceed to resolve the agent from config

#### Scenario: shorthand fires for built-in agent name (unchanged behaviour)
- **WHEN** the user runs `mason claude --role writer`
- **THEN** the CLI SHALL rewrite to `mason run claude --role writer`

#### Scenario: shorthand does not fire for known subcommand names
- **WHEN** the user runs `mason chapter list`
- **THEN** the CLI SHALL NOT rewrite to `mason run chapter list`
- **AND** SHALL execute the `chapter list` subcommand normally

#### Scenario: shorthand does not fire when config file is absent
- **WHEN** `.mason/config.json` does not exist
- **AND** the user runs `mason myagent`
- **THEN** if `myagent` is not a built-in agent type, the CLI SHALL NOT rewrite and SHALL report an unknown command error

### Requirement: --terminal flag added to mason run

The `mason run` command SHALL accept a `--terminal` flag that explicitly selects interactive terminal mode, overriding a config-declared `mode` of `"acp"` or `"bash"`.

#### Scenario: --terminal overrides config mode acp
- **WHEN** an agent config entry has `"mode": "acp"`
- **AND** the user passes `--terminal`
- **THEN** the agent SHALL start in interactive terminal mode

#### Scenario: --terminal is a no-op when mode is already terminal
- **WHEN** an agent config entry has `"mode": "terminal"` or no `mode`
- **AND** the user passes `--terminal`
- **THEN** the agent SHALL start in interactive terminal mode without error

#### Scenario: --acp and --bash remain mutually exclusive with each other
- **WHEN** the user passes both `--acp` and `--bash`
- **THEN** the CLI SHALL print an error: `--bash and --acp are mutually exclusive`
- **AND** exit with code 1

### Requirement: --home flag added to mason run

The `mason run` command SHALL accept a `--home <path>` flag that overrides the `home` property from the agent config entry for the current invocation. `~` SHALL be expanded to the current user's home directory.

#### Scenario: --home overrides config home
- **WHEN** an agent config entry has `"home": "~/default-config"`
- **AND** the user runs `mason run --agent claude --home ~/custom-config --role writer`
- **THEN** the Docker compose SHALL bind-mount `~/custom-config` to `/home/mason/`

#### Scenario: --home with no config home sets the mount
- **WHEN** an agent config entry has no `home` property
- **AND** the user passes `--home ~/my-config`
- **THEN** the Docker compose SHALL bind-mount `~/my-config` to `/home/mason/`
